# Instagram Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receive and reply to Instagram Direct Messages inside the CRM inbox with the existing AI sales agent — full parity with Telegram (text, vision, voice, quote image, proof media), as a new channel adapter.

**Architecture:** A thin Instagram adapter (webhook + Graph API client + parser) feeds the **channel-agnostic** agent pipeline that already exists. `Conversation.channel` is already a discriminator (`@@unique([channel, externalId])`); we add `INSTAGRAM`. Inbound: Meta → `/api/instagram/webhook` (signed) → normalize → upsert `Conversation`/`Message` → `runAgentForInbound/Vision/Voice` (unchanged). Outbound: the existing `sendBusiness*` senders gain a `switch (conversation.channel)` → Instagram Graph API. Instagram media is sent by **public `/uploads` URL** (Caddy serves it), so no Telegram-style `file_id` staging.

**Tech Stack:** Next.js App Router route handlers, Prisma/Postgres, Meta Graph API (`graph.instagram.com`, Instagram-Login flow), HMAC-SHA256 webhook signatures, Vitest.

**Config (env, read at call time — mirrors `TELEGRAM_BOT_TOKEN`):**
- `INSTAGRAM_ACCESS_TOKEN` — long-lived/system token from app setup step 2.
- `INSTAGRAM_VERIFY_TOKEN` — the webhook handshake string (must match Meta's "Verify token" field).
- `INSTAGRAM_APP_SECRET` — App settings → Basic (for `x-hub-signature-256` verification).
- `PUBLIC_BASE_URL` — public origin for media URLs (default `https://etalontbm.uz`).

**Graph API shapes (verify against docs/instagram-integration-setup.md §10 during build):**
- Send: `POST https://graph.instagram.com/v21.0/me/messages?access_token=…` body `{ recipient:{id}, message:{text} }`; image → `message:{ attachment:{ type:'image', payload:{ url } } }`; typing → `{ recipient:{id}, sender_action:'typing_on' }`.
- Inbound POST body: `{ object:'instagram', entry:[{ id, time, messaging:[{ sender:{id}, recipient:{id}, timestamp, message:{ mid, text?, attachments?:[{type, payload:{url}}], is_echo? } }] }] }`.
- GET verify: query `hub.mode=subscribe&hub.verify_token=…&hub.challenge=…` → return the raw `hub.challenge` (200) iff the token matches.
- Profile name: `GET https://graph.instagram.com/v21.0/{IGSID}?fields=name,username&access_token=…` (may be unavailable → fall back to username/id).

---

## File structure

- Create `src/lib/instagram/config.ts` — env accessors + `verifyWebhookSignature(raw, header)`.
- Create `src/lib/instagram/parse.ts` — pure: webhook payload → `ParsedIgMessage[]`.
- Create `src/lib/instagram/api.ts` — Graph API client (send text/image/typing, get profile, download media).
- Create `src/app/api/instagram/webhook/route.ts` — GET verify + signed POST handler.
- Modify `src/middleware.ts:8-13` — add `/api/instagram/webhook` to `PUBLIC_PATHS`.
- Modify `prisma/schema.prisma:1067-1069` — add `INSTAGRAM` to `ConversationChannel`.
- Modify `src/lib/inbox-send.ts` — channel dispatch in `sendBusinessReply`, `sendBusinessPhoto`, `sendBusinessProofMedia`, `sendBusinessLocation`, `sendBusinessTyping`.
- Modify `.env.example` — the four new vars.
- Tests: `src/lib/instagram/parse.test.ts`, `src/lib/instagram/config.test.ts`, `tests/instagram-webhook.test.ts` (GET handshake).

---

## Task 1: Schema — add INSTAGRAM channel

**Files:** Modify `prisma/schema.prisma` (enum `ConversationChannel`, ~line 1067)

- [ ] **Step 1:** change the enum to:
```prisma
enum ConversationChannel {
  TELEGRAM
  INSTAGRAM
}
```
- [ ] **Step 2:** regenerate + push (dev DB):
Run: `npx prisma generate && npx prisma db push`
Expected: "Your database is now in sync". (Prod: `db push` during deploy — no migration files in this project.)
- [ ] **Step 3:** Commit. `git add prisma/schema.prisma && git commit -m "Feat(schema) · INSTAGRAM conversation channel"`

---

## Task 2: Instagram config + signature verification

**Files:** Create `src/lib/instagram/config.ts`, `src/lib/instagram/config.test.ts`

- [ ] **Step 1: failing test** (`config.test.ts`):
```ts
import { describe, it, expect } from 'vitest';
import { verifyWebhookSignature } from './config';
import { createHmac } from 'crypto';

describe('verifyWebhookSignature', () => {
  const secret = 'app-secret';
  const raw = '{"object":"instagram"}';
  const good = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');

  it('accepts a correct signature', () => {
    expect(verifyWebhookSignature(raw, good, secret)).toBe(true);
  });
  it('rejects a wrong signature', () => {
    expect(verifyWebhookSignature(raw, 'sha256=deadbeef', secret)).toBe(false);
  });
  it('rejects a missing header or secret', () => {
    expect(verifyWebhookSignature(raw, null, secret)).toBe(false);
    expect(verifyWebhookSignature(raw, good, '')).toBe(false);
  });
});
```
- [ ] **Step 2:** Run `npx vitest run src/lib/instagram/config.test.ts` → FAIL (module missing).
- [ ] **Step 3: implement** `config.ts`:
```ts
import { createHmac, timingSafeEqual } from 'crypto';

export const igAccessToken = () => process.env.INSTAGRAM_ACCESS_TOKEN ?? '';
export const igVerifyToken = () => process.env.INSTAGRAM_VERIFY_TOKEN ?? '';
export const igAppSecret = () => process.env.INSTAGRAM_APP_SECRET ?? '';
export const publicBaseUrl = () => (process.env.PUBLIC_BASE_URL ?? 'https://etalontbm.uz').replace(/\/$/, '');
export const IG_GRAPH = 'https://graph.instagram.com/v21.0';

/** Verify Meta's x-hub-signature-256 over the RAW request body. Fail-closed. */
export function verifyWebhookSignature(raw: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```
- [ ] **Step 4:** Run the test → PASS.
- [ ] **Step 5:** Commit.

---

## Task 3: Inbound parser (pure)

**Files:** Create `src/lib/instagram/parse.ts`, `src/lib/instagram/parse.test.ts`

Shape mirrors the Telegram parse output the webhook consumes.

- [ ] **Step 1: failing test** (`parse.test.ts`):
```ts
import { describe, it, expect } from 'vitest';
import { parseInstagramWebhook } from './parse';

const text = { object: 'instagram', entry: [{ id: 'IG', messaging: [
  { sender: { id: 'u1' }, recipient: { id: 'IG' }, timestamp: 1, message: { mid: 'm1', text: 'salom' } },
]}]};

describe('parseInstagramWebhook', () => {
  it('parses a text DM', () => {
    const msgs = parseInstagramWebhook(text);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ externalId: 'u1', externalMsgId: 'm1', text: 'salom', media: null });
  });
  it('parses an image attachment', () => {
    const msgs = parseInstagramWebhook({ object: 'instagram', entry: [{ messaging: [
      { sender: { id: 'u1' }, message: { mid: 'm2', attachments: [{ type: 'image', payload: { url: 'https://cdn/x.jpg' } }] } },
    ]}]});
    expect(msgs[0].media).toMatchObject({ kind: 'IMAGE', url: 'https://cdn/x.jpg' });
  });
  it('skips echoes (is_echo) and empty events', () => {
    expect(parseInstagramWebhook({ object: 'instagram', entry: [{ messaging: [
      { sender: { id: 'IG' }, message: { mid: 'm3', text: 'hi', is_echo: true } },
    ]}]})).toEqual([]);
    expect(parseInstagramWebhook({})).toEqual([]);
  });
});
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3: implement** `parse.ts`:
```ts
export interface ParsedIgMedia { kind: 'IMAGE' | 'VOICE' | 'VIDEO' | 'OTHER'; url: string }
export interface ParsedIgMessage {
  externalId: string;       // sender IGSID (the conversation key)
  externalMsgId: string;    // message mid (dedupe)
  text: string | null;
  media: ParsedIgMedia | null;
}

const MEDIA_KIND: Record<string, ParsedIgMedia['kind']> = {
  image: 'IMAGE', audio: 'VOICE', video: 'VIDEO',
};

/** Pure: Meta IG webhook payload → flat list of inbound messages. Drops echoes
 *  (is_echo), our own messages, and anything without a sender + mid. */
export function parseInstagramWebhook(body: unknown): ParsedIgMessage[] {
  const b = body as { object?: string; entry?: Array<{ messaging?: unknown[] }> } | null;
  if (!b || b.object !== 'instagram' || !Array.isArray(b.entry)) return [];
  const out: ParsedIgMessage[] = [];
  for (const entry of b.entry) {
    if (!Array.isArray(entry.messaging)) continue;
    for (const ev of entry.messaging as Array<Record<string, any>>) {
      const m = ev.message;
      if (!m || m.is_echo === true) continue;
      const externalId = ev.sender?.id;
      const externalMsgId = m.mid;
      if (typeof externalId !== 'string' || typeof externalMsgId !== 'string') continue;
      const att = Array.isArray(m.attachments) ? m.attachments[0] : null;
      const media: ParsedIgMedia | null = att?.payload?.url
        ? { kind: MEDIA_KIND[att.type] ?? 'OTHER', url: String(att.payload.url) }
        : null;
      out.push({ externalId, externalMsgId, text: typeof m.text === 'string' ? m.text : null, media });
    }
  }
  return out;
}
```
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit.

---

## Task 4: Graph API client

**Files:** Create `src/lib/instagram/api.ts` (network-only; thin — covered indirectly via the senders/route).

- [ ] **Step 1: implement** `api.ts`:
```ts
import { IG_GRAPH, igAccessToken } from './config';

async function igPost(body: Record<string, unknown>): Promise<{ messageId: string }> {
  const res = await fetch(`${IG_GRAPH}/me/messages?access_token=${encodeURIComponent(igAccessToken())}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(`IG send failed: ${json.error?.message ?? res.status}`);
  return { messageId: String(json.message_id ?? '') };
}

export const igSendText = (recipientId: string, text: string) =>
  igPost({ recipient: { id: recipientId }, message: { text } });

export const igSendImage = (recipientId: string, url: string) =>
  igPost({ recipient: { id: recipientId }, message: { attachment: { type: 'image', payload: { url } } } });

export const igSendVideo = (recipientId: string, url: string) =>
  igPost({ recipient: { id: recipientId }, message: { attachment: { type: 'video', payload: { url } } } });

/** Best-effort typing indicator; swallow errors (cosmetic). */
export async function igSendTyping(recipientId: string): Promise<void> {
  try {
    await fetch(`${IG_GRAPH}/me/messages?access_token=${encodeURIComponent(igAccessToken())}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientId }, sender_action: 'typing_on' }),
    });
  } catch { /* cosmetic */ }
}

/** Display name for a sender; falls back to the IGSID when the profile is private. */
export async function igGetName(igsid: string): Promise<string> {
  try {
    const res = await fetch(`${IG_GRAPH}/${igsid}?fields=name,username&access_token=${encodeURIComponent(igAccessToken())}`);
    const json = await res.json();
    return json.name || json.username || igsid;
  } catch { return igsid; }
}

export async function igDownloadMedia(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`IG media download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
```
- [ ] **Step 2:** Typecheck `npx tsc --noEmit` → clean.
- [ ] **Step 3:** Commit.

---

## Task 5: Channel-aware senders

**Files:** Modify `src/lib/inbox-send.ts` (add `channel` to each conversation `select`; branch to Instagram).

Pattern for each sender (after loading the conversation, before the Telegram path):
```ts
// add `channel: true` to the select
if (conversation.channel === 'INSTAGRAM') { /* IG branch (below) */ }
```

- [ ] **Step 1:** `sendBusinessReply` → IG branch: `const { igSendText } = await import('@/lib/instagram/api'); ... const sent = await igSendText(conversation.externalId, input.text);` then persist the OUTBOUND message exactly as today (set `telegramMsgId`/external id = `sent.messageId`, `failed` on throw). Wrap in try/catch → `failed=true` on error (covers the 24h-window rejection → routes to a human via auto-mode).
- [ ] **Step 2:** `sendBusinessTyping` → IG branch: `const { igSendTyping } = await import('@/lib/instagram/api'); await igSendTyping(conversation.externalId);` (already best-effort/try-caught).
- [ ] **Step 3:** `sendBusinessPhoto` (quote card bytes) → IG branch: save bytes to `/uploads` (already done in the function), build the public URL `${publicBaseUrl()}${mediaPath}`, then `igSendImage(conversation.externalId, url)`; persist outbound IMAGE as today.
- [ ] **Step 4:** `sendBusinessProofMedia` → IG branch: send the stored `previewPath` as a public URL via `igSendImage`/`igSendVideo` by `kind`; persist marker.
- [ ] **Step 5:** `sendBusinessLocation` → IG branch: Instagram has no native map pin → send the company address + maps link as TEXT (`igSendText`) using `locationReplyText`/`COMPANY_LOCATION.mapsUrl`; persist a `📍` marker. (The text reply that accompanies it is sent separately by `sendCompanyLocation`.)
- [ ] **Step 6:** Add a dispatch test `src/lib/inbox-send.test.ts` if not present — assert the IG branch is taken for `channel:'INSTAGRAM'` by injecting a fake `igSend*` (or keep it integration-light; minimum: typecheck + the route test below). Commit.

---

## Task 6: Inbound webhook route + middleware

**Files:** Create `src/app/api/instagram/webhook/route.ts`; modify `src/middleware.ts`; test `tests/instagram-webhook.test.ts`.

- [ ] **Step 1:** middleware — add to `PUBLIC_PATHS`:
```ts
"/api/instagram/webhook",
```
- [ ] **Step 2: failing test** (`tests/instagram-webhook.test.ts`) — GET handshake (pure-ish; set env in the test):
```ts
import { describe, it, expect, beforeAll } from 'vitest';
beforeAll(() => { process.env.INSTAGRAM_VERIFY_TOKEN = 'vt'; });
import { GET } from '@/app/api/instagram/webhook/route';
import { NextRequest } from 'next/server';

describe('IG webhook GET verify', () => {
  it('echoes the challenge when the token matches', async () => {
    const url = 'https://x/api/instagram/webhook?hub.mode=subscribe&hub.verify_token=vt&hub.challenge=42';
    const res = await GET(new NextRequest(url));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('42');
  });
  it('403s on a wrong token', async () => {
    const url = 'https://x/api/instagram/webhook?hub.mode=subscribe&hub.verify_token=NOPE&hub.challenge=42';
    const res = await GET(new NextRequest(url));
    expect(res.status).toBe(403);
  });
});
```
- [ ] **Step 3:** Run → FAIL.
- [ ] **Step 4: implement** `route.ts`:
```ts
export const runtime = 'nodejs';
import { NextRequest } from 'next/server';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { igVerifyToken, igAppSecret, verifyWebhookSignature } from '@/lib/instagram/config';
import { parseInstagramWebhook } from '@/lib/instagram/parse';
import { igGetName, igDownloadMedia } from '@/lib/instagram/api';
import { saveBufferToUploads } from '@/lib/uploads';
import { emitInbox } from '@/lib/inbox-bus';
import { runAgentForInbound, runVisionForInbound, runVoiceForInbound } from '@/lib/agent/webhook-entry';

export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === igVerifyToken()) {
    return new Response(p.get('hub.challenge') ?? '', { status: 200 });
  }
  return new Response('forbidden', { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get('x-hub-signature-256'), igAppSecret())) {
    return new Response('forbidden', { status: 401 });
  }
  const body = JSON.parse(raw || 'null');
  const msgs = parseInstagramWebhook(body);
  for (const m of msgs) {
    try {
      const conversation = await prisma.conversation.upsert({
        where: { channel_externalId: { channel: 'INSTAGRAM', externalId: m.externalId } },
        create: {
          channel: 'INSTAGRAM', externalId: m.externalId,
          displayName: await igGetName(m.externalId),
          // IG JID IS the customer's account → use it for client lookup later.
          sharedContactPhone: null,
          lastMessageAt: new Date(), lastSnippet: (m.text ?? '[media]').slice(0, 80), unread: true,
        },
        update: { lastMessageAt: new Date(), lastSnippet: (m.text ?? '[media]').slice(0, 80), unread: true },
      });

      let mediaPath: string | null = null;
      if (m.media && (m.media.kind === 'IMAGE' || m.media.kind === 'VOICE')) {
        try {
          const buf = await igDownloadMedia(m.media.url);
          const ext = m.media.kind === 'IMAGE' ? '.jpg' : '.ogg';
          mediaPath = await saveBufferToUploads(buf, `inbox/${conversation.id}`, `${m.externalMsgId}${ext}`);
        } catch { /* leave null; agent handles */ }
      }

      const message = await prisma.message.upsert({
        where: { conversationId_telegramMsgId: { conversationId: conversation.id, telegramMsgId: m.externalMsgId } },
        create: {
          conversationId: conversation.id, direction: 'INBOUND', text: m.text,
          mediaKind: (m.media?.kind === 'IMAGE' ? 'IMAGE' : m.media?.kind === 'VOICE' ? 'VOICE' : null) as never,
          mediaPath, telegramMsgId: m.externalMsgId,
        },
        update: {},
        select: { id: true },
      });
      emitInbox({ type: 'message:new', conversationId: conversation.id, messageId: message.id });

      const conv = { id: conversation.id, aiState: conversation.aiState, aiPaused: conversation.aiPaused, sharedContactPhone: conversation.sharedContactPhone };
      if (m.text && m.text.trim()) {
        void runAgentForInbound(conv, m.text, message.id).catch((e) => console.error('[ig agent]', e));
      } else if (m.media?.kind === 'IMAGE' && mediaPath) {
        void runVisionForInbound(conv, mediaPath, 'image/jpeg', message.id).catch((e) => console.error('[ig vision]', e));
      } else if (m.media?.kind === 'VOICE' && mediaPath) {
        void runVoiceForInbound(conv, mediaPath, 'audio/ogg', message.id).catch((e) => console.error('[ig voice]', e));
      }
    } catch (err) {
      console.error('[instagram webhook]', err);
    }
  }
  return new Response('ok');
}
```
- [ ] **Step 5:** Run the GET test → PASS. Typecheck → clean.
- [ ] **Step 6:** Commit.

> NOTE on `telegramMsgId`: reused as the generic external-message-id (avoids a rename across the codebase). Optional future cleanup → `externalMsgId`. Documented, not blocking.

---

## Task 7: Env, wire-up, deploy, verify

- [ ] **Step 1:** Add to `.env.example`: `INSTAGRAM_ACCESS_TOKEN=`, `INSTAGRAM_VERIFY_TOKEN=`, `INSTAGRAM_APP_SECRET=`, `PUBLIC_BASE_URL=https://etalontbm.uz`. Commit.
- [ ] **Step 2:** Full suite `npx vitest run` + `npx tsc --noEmit` → green.
- [ ] **Step 3:** Put the four values in prod `.env` + `docker-compose.yml` app `environment:` passthrough (it's an explicit list — like `QUOTE_SIGNING_SECRET`). Set `INSTAGRAM_VERIFY_TOKEN` to the same string you'll type in Meta.
- [ ] **Step 4:** Deploy (build + `db push` for the enum + up). Verify HEAD + healthy container.
- [ ] **Step 5:** In Meta → Instagram → Configure webhooks: Callback `https://etalontbm.uz/api/instagram/webhook`, Verify token = the env value → **Verify and save** (now passes) → subscribe field **`messages`** → **publish/subscribe the account**.
- [ ] **Step 6:** End-to-end test from the **tester** Instagram account: DM the business account → it appears in `/inbox` (INSTAGRAM badge) → agent replies in the chat. Confirm vision (send a floor plan) + voice.

---

## Self-review notes
- Spec coverage: schema ✓, webhook (GET+signed POST) ✓, parse ✓, Graph client ✓, channel-aware senders ✓, config ✓, tests ✓, deploy ✓.
- Reuse: `runAgentForInbound/Vision/Voice`, proposals, modes, quote image, proof media, pattern-policy — all unchanged (channel-agnostic).
- 24h window: handled implicitly — an out-of-window send throws → `failed=true` → auto-mode routes to a human. No special code.
- Media OUT uses public `/uploads` URLs (Caddy serves them) — Meta fetches the URL; no file_id staging.
- Open: `displayName` from `igGetName` may be the IGSID if the profile is private — acceptable; operator sees the IG username when available.
