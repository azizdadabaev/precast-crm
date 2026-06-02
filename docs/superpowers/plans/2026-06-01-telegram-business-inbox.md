# Telegram Business Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared, owner-only CRM inbox that ingests Telegram Business messages (text + all media types), lets the owner reply as the business account, and updates live — with a password unlock for shared PCs.

**Architecture:** Telegram POSTs `business_message` updates to a public Next.js webhook (`/api/telegram/webhook`, guarded by a secret-token header). The webhook upserts a `Conversation`, inserts a `Message`, downloads any ≤20 MB media into the existing uploads volume, and emits an in-process event. The inbox UI reads conversations/messages over JSON APIs and live-updates via an SSE stream (mirroring the existing notifications stream). Outbound replies call the Bot API `sendMessage` with the stored `business_connection_id`. Access is gated by a new `inbox.access` permission (OWNER-only) plus a per-session password-unlock cookie.

**Tech Stack:** Next.js 14 App Router, Prisma + PostgreSQL, `jose` (JWT for the unlock cookie), React Query, Tailwind/shadcn, Vitest. Spec: [docs/superpowers/specs/2026-06-01-telegram-business-inbox-design.md](../specs/2026-06-01-telegram-business-inbox-design.md).

**Conventions in this codebase (read before starting):**
- API routes are wrapped with `withPermission(action, fn)` / `withAuth(fn)` from `src/lib/api-auth.ts`; the inner `fn` receives `(req, { user, params })` and returns a `Response`. Use `ok()`, `created()`, `fail()` from `src/lib/api.ts`.
- Permission checks use `can(user, action)`; permissions are defined in `src/lib/permissions.ts`.
- Client fetches use `api<T>(url, { json })` from `src/lib/fetcher.ts` (returns `payload.data`).
- Uploads are written to `process.cwd()/public/uploads/<subdir>` via helpers in `src/lib/uploads.ts`; in production that path is the `uploads` Docker volume, served by Caddy at `/uploads/*`.
- SSE pattern: `export const dynamic = "force-dynamic"; export const runtime = "nodejs";` + a `ReadableStream` + a global `EventEmitter` singleton. See `src/app/api/notifications/stream/route.ts` and `src/lib/notification-bus.ts`.
- Schema changes use `npx prisma db push` (no migrations folder). All additions here are additive.
- Tests live in `tests/*.test.ts`, import from `../src/...`, use `vitest`. Run with `npx vitest run`.
- Working branch: `feat/telegram-business-inbox` (already created).

---

## File Structure

**New files:**
- `src/lib/telegram/parse.ts` — pure parser: Telegram update → normalized inbound shape + media classification. (Unit-tested.)
- `src/lib/telegram/api.ts` — thin Bot API client: send message, get file path, download file.
- `src/lib/telegram/webhook-secret.ts` — pure `isValidWebhookSecret(header, expected)` guard. (Unit-tested.)
- `src/lib/inbox-bus.ts` — global `EventEmitter` singleton for live inbox events.
- `src/lib/inbox-auth.ts` — password-unlock cookie sign/verify + `withInboxAccess` wrapper.
- `src/app/api/telegram/webhook/route.ts` — ingestion endpoint (public, secret-guarded).
- `src/app/api/inbox/route.ts` — GET conversation list.
- `src/app/api/inbox/[id]/route.ts` — GET messages for a conversation + mark read.
- `src/app/api/inbox/[id]/reply/route.ts` — POST a text reply.
- `src/app/api/inbox/unlock/route.ts` — GET unlock status, POST password to unlock.
- `src/app/api/inbox/stream/route.ts` — SSE live stream.
- `src/app/(app)/inbox/page.tsx` — server wrapper.
- `src/app/(app)/inbox/InboxClient.tsx` — the inbox UI (lock gate + two-pane).
- `src/components/inbox/MessageBubble.tsx` — one message + media dispatch.
- `src/components/inbox/MediaRenderers.tsx` — per-`MediaKind` renderers.
- `tests/telegram-parse.test.ts`, `tests/telegram-webhook-secret.test.ts`, `tests/inbox-auth.test.ts` — unit tests.

**Modified files:**
- `prisma/schema.prisma` — add `Conversation`, `Message`, 3 enums.
- `src/lib/permissions.ts` — add `inbox.access` (ACTIONS, group, label, OWNER template).
- `src/lib/page-auth.ts` — add `/inbox` → `inbox.access`.
- `src/components/sidebar.tsx` — add the Inbox nav item.
- `src/lib/uploads.ts` — add `saveBufferToUploads`.
- `src/middleware.ts` — add `/api/telegram/webhook` to `PUBLIC_PATHS`.
- `docker-compose.yml`, `precast-crm/.env.example`, `.env.production.example` — new env vars.

---

## Task 1: Schema, permission, env scaffolding

**Files:**
- Modify: `precast-crm/prisma/schema.prisma`
- Modify: `precast-crm/src/lib/permissions.ts`
- Modify: `precast-crm/src/middleware.ts`
- Modify: `docker-compose.yml`, `precast-crm/.env.example`, `.env.production.example`

- [ ] **Step 1: Add the Prisma models** at the end of `prisma/schema.prisma`:

```prisma
enum ConversationChannel { TELEGRAM }
enum MessageDirection    { INBOUND OUTBOUND }
enum MediaKind           { IMAGE VIDEO VIDEO_NOTE VOICE AUDIO DOCUMENT LOCATION OTHER }

model Conversation {
  id                   String              @id @default(cuid())
  channel              ConversationChannel @default(TELEGRAM)
  externalId           String              // Telegram chat id (the chat to reply to)
  businessConnectionId String?
  displayName          String
  username             String?
  lastMessageAt        DateTime
  lastSnippet          String              @default("")
  unread               Boolean             @default(true)
  createdAt            DateTime            @default(now())
  messages             Message[]

  @@unique([channel, externalId])
  @@index([lastMessageAt])
}

model Message {
  id             String           @id @default(cuid())
  conversationId String
  direction      MessageDirection
  text           String?
  mediaKind      MediaKind?
  mediaPath      String?
  mediaName      String?
  mediaMeta      Json?
  telegramMsgId  String?
  sentById       String?          // operator id (no FK; owner-only inbox)
  failed         Boolean          @default(false)
  createdAt      DateTime         @default(now())

  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
  @@unique([conversationId, telegramMsgId])
}
```

- [ ] **Step 2: Push the schema and regenerate the client**

Run: `cd precast-crm && npx prisma db push && npx prisma generate`
Expected: "Your database is now in sync with your Prisma schema." and a regenerated client (no errors).

- [ ] **Step 3: Add the `inbox.access` permission** in `src/lib/permissions.ts`. Append to `ACTIONS` (after `"blender.bridge"`):

```ts
  // Telegram inbox (owner-only)
  "inbox.access", // owner-only · read & reply to Telegram conversations
```

Add a new group to `PERMISSION_GROUPS` (after the `sandbox` group):

```ts
  {
    key: "inbox",
    label: "Хабарлар · Inbox",
    actions: ["inbox.access"],
  },
```

Add to `ACTION_LABELS`:

```ts
  "inbox.access": "Telegram хабарлари · Telegram inbox (owner-only)",
```

Add `"inbox.access"` to the `OWNER` array in `ROLE_TEMPLATES` (and to NO other role):

```ts
    "blender.bridge",
    "inbox.access",
    "report.view",
```

- [ ] **Step 4: Allow the webhook through middleware.** In `src/middleware.ts`, add to `PUBLIC_PATHS`:

```ts
  "/api/telegram/webhook",
```

- [ ] **Step 5: Add env vars.** In `docker-compose.yml`, under `services.app.environment`, add:

```yaml
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:-}
      TELEGRAM_WEBHOOK_SECRET: ${TELEGRAM_WEBHOOK_SECRET:-}
      INBOX_PASSWORD: ${INBOX_PASSWORD:-}
```

In `precast-crm/.env.example` and `.env.production.example`, add:

```
# Telegram Business Inbox
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
INBOX_PASSWORD=
```

- [ ] **Step 6: Verify types compile**

Run: `cd precast-crm && npx tsc --noEmit`
Expected: no NEW errors referencing `Conversation`, `Message`, `inbox.access`, or `middleware`. (Pre-existing Prisma-client errors noted in HANDOFF.md may remain.)

- [ ] **Step 7: Commit**

```bash
git add precast-crm/prisma/schema.prisma precast-crm/src/lib/permissions.ts precast-crm/src/middleware.ts docker-compose.yml precast-crm/.env.example .env.production.example
git commit -m "feat(inbox) · schema, inbox.access permission, webhook public path, env slots"
```

---

## Task 2: Telegram update parser (pure, TDD)

**Files:**
- Create: `precast-crm/src/lib/telegram/parse.ts`
- Test: `precast-crm/tests/telegram-parse.test.ts`

- [ ] **Step 1: Write the failing tests** in `tests/telegram-parse.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseBusinessUpdate, classifyMedia } from "../src/lib/telegram/parse";

const base = {
  message_id: 42,
  business_connection_id: "bizconn1",
  from: { id: 555, first_name: "Алишер", last_name: "У", username: "alisher_t" },
  chat: { id: 555 },
  date: 1717200000,
};

describe("classifyMedia", () => {
  it("returns null for a text-only message", () => {
    expect(classifyMedia({ ...base, text: "narxi qancha?" })).toBeNull();
  });
  it("picks the largest photo size as IMAGE", () => {
    const m = classifyMedia({
      ...base,
      photo: [
        { file_id: "small", file_size: 100, width: 90, height: 90 },
        { file_id: "big", file_size: 9000, width: 1280, height: 1280 },
      ],
    });
    expect(m).toMatchObject({ kind: "IMAGE", fileId: "big", fileSize: 9000 });
  });
  it("classifies voice with duration meta", () => {
    const m = classifyMedia({ ...base, voice: { file_id: "v1", duration: 7, file_size: 5000, mime_type: "audio/ogg" } });
    expect(m).toMatchObject({ kind: "VOICE", fileId: "v1", fileSize: 5000, meta: { duration: 7 } });
  });
  it("classifies round video_note", () => {
    const m = classifyMedia({ ...base, video_note: { file_id: "vn1", duration: 5, length: 240, file_size: 8000 } });
    expect(m).toMatchObject({ kind: "VIDEO_NOTE", fileId: "vn1" });
  });
  it("classifies file video", () => {
    const m = classifyMedia({ ...base, video: { file_id: "vid1", duration: 12, file_size: 999999 } });
    expect(m).toMatchObject({ kind: "VIDEO", fileId: "vid1" });
  });
  it("classifies audio with title", () => {
    const m = classifyMedia({ ...base, audio: { file_id: "a1", title: "song", file_size: 4000 } });
    expect(m).toMatchObject({ kind: "AUDIO", fileId: "a1", meta: { title: "song" } });
  });
  it("classifies a document with filename", () => {
    const m = classifyMedia({ ...base, document: { file_id: "d1", file_name: "drawing.pdf", mime_type: "application/pdf", file_size: 240000 } });
    expect(m).toMatchObject({ kind: "DOCUMENT", fileId: "d1", fileName: "drawing.pdf", fileSize: 240000 });
  });
  it("classifies a bare location with lat/lng meta and NO fileId", () => {
    const m = classifyMedia({ ...base, location: { latitude: 41.31, longitude: 69.28 } });
    expect(m).toMatchObject({ kind: "LOCATION", meta: { lat: 41.31, lng: 69.28 } });
    expect(m?.fileId).toBeUndefined();
  });
  it("classifies a venue with title/address", () => {
    const m = classifyMedia({ ...base, venue: { location: { latitude: 41.31, longitude: 69.28 }, title: "Office", address: "Yunusobod" } });
    expect(m).toMatchObject({ kind: "LOCATION", meta: { lat: 41.31, lng: 69.28, title: "Office", address: "Yunusobod" } });
  });
  it("classifies an unsupported type (sticker) as OTHER", () => {
    const m = classifyMedia({ ...base, sticker: { file_id: "s1" } });
    expect(m).toMatchObject({ kind: "OTHER" });
  });
});

describe("parseBusinessUpdate", () => {
  it("returns null when there is no business_message", () => {
    expect(parseBusinessUpdate({ update_id: 1 })).toBeNull();
  });
  it("parses a text business_message", () => {
    const p = parseBusinessUpdate({ update_id: 1, business_message: { ...base, text: "salom" } });
    expect(p).toMatchObject({
      businessConnectionId: "bizconn1",
      chatId: "555",
      telegramMsgId: "42",
      displayName: "Алишер У",
      username: "alisher_t",
      text: "salom",
      media: null,
      isEdited: false,
    });
  });
  it("uses caption as text when media has a caption", () => {
    const p = parseBusinessUpdate({
      update_id: 1,
      business_message: { ...base, caption: "mana chizma", document: { file_id: "d1", file_name: "a.pdf", file_size: 10 } },
    });
    expect(p?.text).toBe("mana chizma");
    expect(p?.media).toMatchObject({ kind: "DOCUMENT" });
  });
  it("flags edited_business_message with isEdited true", () => {
    const p = parseBusinessUpdate({ update_id: 1, edited_business_message: { ...base, text: "tuzatildi" } });
    expect(p).toMatchObject({ isEdited: true, text: "tuzatildi" });
  });
  it("falls back to first_name only when last_name is absent", () => {
    const p = parseBusinessUpdate({ update_id: 1, business_message: { ...base, from: { id: 9, first_name: "Бобур" }, text: "hi" } });
    expect(p?.displayName).toBe("Бобур");
    expect(p?.username).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `cd precast-crm && npx vitest run tests/telegram-parse.test.ts`
Expected: FAIL — "Failed to resolve import ../src/lib/telegram/parse".

- [ ] **Step 3: Implement `src/lib/telegram/parse.ts`:**

```ts
// Pure parsing of Telegram Bot API "business" updates into a normalized
// inbound shape. No I/O — fully unit-tested. The webhook route consumes
// these and performs persistence + media download.

export type ParsedMediaKind =
  | "IMAGE" | "VIDEO" | "VIDEO_NOTE" | "VOICE" | "AUDIO" | "DOCUMENT" | "LOCATION" | "OTHER";

export interface ParsedMedia {
  kind: ParsedMediaKind;
  fileId?: string;       // absent for LOCATION and OTHER
  fileName?: string;
  fileSize?: number;
  meta?: Record<string, unknown>;
}

export interface ParsedInbound {
  businessConnectionId: string | null;
  chatId: string;
  telegramMsgId: string;
  displayName: string;
  username: string | null;
  text: string | null;
  media: ParsedMedia | null;
  isEdited: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export function classifyMedia(message: any): ParsedMedia | null {
  if (!message || typeof message !== "object") return null;

  if (Array.isArray(message.photo) && message.photo.length) {
    // Telegram sends multiple sizes ascending; pick the largest.
    const largest = [...message.photo].sort(
      (a, b) => (a.file_size ?? 0) - (b.file_size ?? 0),
    )[message.photo.length - 1];
    return { kind: "IMAGE", fileId: largest.file_id, fileSize: largest.file_size };
  }
  if (message.video_note) {
    return {
      kind: "VIDEO_NOTE",
      fileId: message.video_note.file_id,
      fileSize: message.video_note.file_size,
      meta: { duration: message.video_note.duration },
    };
  }
  if (message.video) {
    return {
      kind: "VIDEO",
      fileId: message.video.file_id,
      fileName: message.video.file_name,
      fileSize: message.video.file_size,
      meta: { duration: message.video.duration },
    };
  }
  if (message.animation) {
    // GIF-style MP4 — render as a video.
    return { kind: "VIDEO", fileId: message.animation.file_id, fileSize: message.animation.file_size };
  }
  if (message.voice) {
    return {
      kind: "VOICE",
      fileId: message.voice.file_id,
      fileSize: message.voice.file_size,
      meta: { duration: message.voice.duration },
    };
  }
  if (message.audio) {
    return {
      kind: "AUDIO",
      fileId: message.audio.file_id,
      fileName: message.audio.file_name,
      fileSize: message.audio.file_size,
      meta: { title: message.audio.title },
    };
  }
  if (message.document) {
    return {
      kind: "DOCUMENT",
      fileId: message.document.file_id,
      fileName: message.document.file_name,
      fileSize: message.document.file_size,
    };
  }
  if (message.venue) {
    const loc = message.venue.location ?? {};
    return {
      kind: "LOCATION",
      meta: { lat: loc.latitude, lng: loc.longitude, title: message.venue.title, address: message.venue.address },
    };
  }
  if (message.location) {
    return { kind: "LOCATION", meta: { lat: message.location.latitude, lng: message.location.longitude } };
  }
  // Known-but-unsupported content (sticker, contact, poll, dice, etc.)
  if (message.sticker || message.contact || message.poll || message.dice) {
    return { kind: "OTHER" };
  }
  return null;
}

function pickMessage(update: any): { msg: any; edited: boolean } | null {
  if (update?.business_message) return { msg: update.business_message, edited: false };
  if (update?.edited_business_message) return { msg: update.edited_business_message, edited: true };
  return null;
}

export function parseBusinessUpdate(update: any): ParsedInbound | null {
  const picked = pickMessage(update);
  if (!picked) return null;
  const m = picked.msg;
  const from = m.from ?? {};
  const displayName = [from.first_name, from.last_name].filter(Boolean).join(" ") || "Telegram";
  const media = classifyMedia(m);
  return {
    businessConnectionId: m.business_connection_id ?? null,
    chatId: String(m.chat?.id ?? from.id ?? ""),
    telegramMsgId: String(m.message_id ?? ""),
    displayName,
    username: from.username ?? null,
    text: m.text ?? m.caption ?? null,
    media,
    isEdited: picked.edited,
  };
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd precast-crm && npx vitest run tests/telegram-parse.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add precast-crm/src/lib/telegram/parse.ts precast-crm/tests/telegram-parse.test.ts
git commit -m "feat(inbox) · pure Telegram business-update parser + tests"
```

---

## Task 3: Webhook-secret guard (pure, TDD)

**Files:**
- Create: `precast-crm/src/lib/telegram/webhook-secret.ts`
- Test: `precast-crm/tests/telegram-webhook-secret.test.ts`

- [ ] **Step 1: Write the failing test:**

```ts
import { describe, it, expect } from "vitest";
import { isValidWebhookSecret } from "../src/lib/telegram/webhook-secret";

describe("isValidWebhookSecret", () => {
  it("accepts a matching, non-empty header", () => {
    expect(isValidWebhookSecret("abc123", "abc123")).toBe(true);
  });
  it("rejects a mismatch", () => {
    expect(isValidWebhookSecret("wrong", "abc123")).toBe(false);
  });
  it("rejects when the header is missing", () => {
    expect(isValidWebhookSecret(null, "abc123")).toBe(false);
  });
  it("rejects when the expected secret is unset (fail closed)", () => {
    expect(isValidWebhookSecret("abc123", undefined)).toBe(false);
    expect(isValidWebhookSecret("", "")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd precast-crm && npx vitest run tests/telegram-webhook-secret.test.ts`
Expected: FAIL — unresolved import.

- [ ] **Step 3: Implement `src/lib/telegram/webhook-secret.ts`:**

```ts
// Guards the public webhook. Fails closed: if the expected secret is
// unset, every request is rejected (prevents an unconfigured deploy
// from accepting unauthenticated POSTs).
export function isValidWebhookSecret(
  header: string | null | undefined,
  expected: string | undefined,
): boolean {
  if (!expected || expected.length === 0) return false;
  if (!header || header.length === 0) return false;
  return header === expected;
}
```

- [ ] **Step 4: Run to confirm pass**

Run: `cd precast-crm && npx vitest run tests/telegram-webhook-secret.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add precast-crm/src/lib/telegram/webhook-secret.ts precast-crm/tests/telegram-webhook-secret.test.ts
git commit -m "feat(inbox) · fail-closed webhook secret guard + tests"
```

---

## Task 4: Telegram Bot API client + buffer upload helper

**Files:**
- Create: `precast-crm/src/lib/telegram/api.ts`
- Modify: `precast-crm/src/lib/uploads.ts`

- [ ] **Step 1: Add `saveBufferToUploads` to `src/lib/uploads.ts`** (after `saveImageFromFormData`):

```ts
/**
 * Persist a raw buffer (e.g. media downloaded from Telegram) to the
 * uploads volume and return its public URL. Unlike saveImageFromFormData
 * this does no MIME/size validation — the caller already enforces limits.
 */
export async function saveBufferToUploads(
  buffer: Buffer,
  subdir: string,
  filename: string,
): Promise<string> {
  const dir = path.join(UPLOAD_ROOT, subdir);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), buffer);
  return `/uploads/${subdir}/${filename}`.replace(/\\/g, "/");
}
```

- [ ] **Step 2: Implement `src/lib/telegram/api.ts`:**

```ts
// Thin Bot API client. Network-only; no business logic. Token read from
// env at call time so a missing token surfaces as a clear runtime error
// rather than a build-time one.

const TELEGRAM_MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024; // Bot API getFile cap (~20 MB)
export { TELEGRAM_MAX_DOWNLOAD_BYTES };

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  return t;
}

function apiUrl(method: string): string {
  return `https://api.telegram.org/bot${token()}/${method}`;
}

/** Send a text message on behalf of the connected business account. */
export async function tgSendBusinessMessage(
  businessConnectionId: string,
  chatId: string,
  text: string,
): Promise<{ messageId: string }> {
  const res = await fetch(apiUrl("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      business_connection_id: businessConnectionId,
      chat_id: chatId,
      text,
    }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram sendMessage failed: ${json.description ?? res.status}`);
  return { messageId: String(json.result.message_id) };
}

/** Resolve a file_id to a server file_path via getFile. */
export async function tgGetFilePath(fileId: string): Promise<string> {
  const res = await fetch(apiUrl("getFile"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram getFile failed: ${json.description ?? res.status}`);
  return json.result.file_path as string;
}

/** Download a resolved file_path into a Buffer. */
export async function tgDownloadFile(filePath: string): Promise<Buffer> {
  const url = `https://api.telegram.org/file/bot${token()}/${filePath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
```

- [ ] **Step 3: Verify compile**

Run: `cd precast-crm && npx tsc --noEmit`
Expected: no new errors in `uploads.ts` or `telegram/api.ts`.

- [ ] **Step 4: Commit**

```bash
git add precast-crm/src/lib/telegram/api.ts precast-crm/src/lib/uploads.ts
git commit -m "feat(inbox) · Bot API client (send/getFile/download) + saveBufferToUploads"
```

---

## Task 5: Inbox event bus + SSE stream

**Files:**
- Create: `precast-crm/src/lib/inbox-bus.ts`
- Create: `precast-crm/src/app/api/inbox/stream/route.ts`

- [ ] **Step 1: Implement `src/lib/inbox-bus.ts`** (mirrors `notification-bus.ts`; single shared channel since the inbox is owner-only):

```ts
import { EventEmitter } from "events";

declare global {
  // eslint-disable-next-line no-var
  var __inboxBus: EventEmitter | undefined;
}

const bus: EventEmitter =
  global.__inboxBus ?? new EventEmitter().setMaxListeners(200);

if (!global.__inboxBus) {
  global.__inboxBus = bus;
}

export const inboxBus = bus;
export const INBOX_EVENT = "inbox";

/** Broadcast a JSON-serializable payload to all connected inbox tabs. */
export function emitInbox(payload: unknown): void {
  bus.emit(INBOX_EVENT, JSON.stringify(payload));
}
```

- [ ] **Step 2: Implement `src/app/api/inbox/stream/route.ts`** (mirrors `notifications/stream`, gated by `inbox.access` + unlock):

```ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { isInboxUnlocked } from "@/lib/inbox-auth";
import { inboxBus, INBOX_EVENT } from "@/lib/inbox-bus";

export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.isActive || !can(user, "inbox.access")) {
    return new Response("Forbidden", { status: 403 });
  }
  if (!(await isInboxUnlocked())) {
    return new Response("Locked", { status: 403 });
  }

  let closed = false;
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(": connected\n\n"));

      const ping = setInterval(() => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { cleanup(); }
      }, 30_000);

      const onEvent = (payload: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(`data: ${payload}\n\n`)); } catch { cleanup(); }
      };
      inboxBus.on(INBOX_EVENT, onEvent);

      function cleanup() {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        inboxBus.off(INBOX_EVENT, onEvent);
        try { controller.close(); } catch { /* already closed */ }
      }
      _req.signal.addEventListener("abort", cleanup, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

- [ ] **Step 3: Verify compile** (note: `inbox-auth.ts` is created in Task 6; this step will fail to resolve `isInboxUnlocked` until then — that's expected and fixed in Task 6 Step 5).

Run: `cd precast-crm && npx tsc --noEmit`
Expected: only an unresolved `@/lib/inbox-auth` import; no other new errors.

- [ ] **Step 4: Commit**

```bash
git add precast-crm/src/lib/inbox-bus.ts precast-crm/src/app/api/inbox/stream/route.ts
git commit -m "feat(inbox) · inbox event bus + SSE stream route"
```

---

## Task 6: Password-unlock auth (TDD for the pure parts)

**Files:**
- Create: `precast-crm/src/lib/inbox-auth.ts`
- Create: `precast-crm/src/app/api/inbox/unlock/route.ts`
- Test: `precast-crm/tests/inbox-auth.test.ts`

- [ ] **Step 1: Write the failing test for the password check:**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { verifyInboxPassword } from "../src/lib/inbox-auth";

const original = process.env.INBOX_PASSWORD;
afterEach(() => { process.env.INBOX_PASSWORD = original; });

describe("verifyInboxPassword", () => {
  it("accepts the exact configured password", () => {
    process.env.INBOX_PASSWORD = "open-sesame";
    expect(verifyInboxPassword("open-sesame")).toBe(true);
  });
  it("rejects a wrong password", () => {
    process.env.INBOX_PASSWORD = "open-sesame";
    expect(verifyInboxPassword("nope")).toBe(false);
  });
  it("fails closed when no password is configured", () => {
    delete process.env.INBOX_PASSWORD;
    expect(verifyInboxPassword("anything")).toBe(false);
    process.env.INBOX_PASSWORD = "";
    expect(verifyInboxPassword("")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd precast-crm && npx vitest run tests/inbox-auth.test.ts`
Expected: FAIL — unresolved import.

- [ ] **Step 3: Implement `src/lib/inbox-auth.ts`:**

```ts
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { SignJWT, jwtVerify } from "jose";
import { fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import type { RouteContext } from "@/lib/api-auth";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-secret-change-me-please-32chars!",
);
const UNLOCK_COOKIE = "inbox_unlock";
const UNLOCK_TTL_SECONDS = 60 * 60 * 12; // 12h, clears on tab close earlier via session use

/** Pure password check. Fails closed when INBOX_PASSWORD is unset/empty. */
export function verifyInboxPassword(input: string): boolean {
  const expected = process.env.INBOX_PASSWORD ?? "";
  return expected.length > 0 && input === expected;
}

/** Issue the short-lived unlock cookie after a correct password. */
export async function setInboxUnlockCookie(): Promise<void> {
  const token = await new SignJWT({ inbox: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(SECRET);
  cookies().set(UNLOCK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: UNLOCK_TTL_SECONDS,
  });
}

/** True if a valid, unexpired unlock cookie is present. */
export async function isInboxUnlocked(): Promise<boolean> {
  const t = cookies().get(UNLOCK_COOKIE)?.value;
  if (!t) return false;
  try {
    await jwtVerify(t, SECRET);
    return true;
  } catch {
    return false;
  }
}

/**
 * Compose the OWNER `inbox.access` permission gate with the per-session
 * password unlock. Returns 403 { code: "INBOX_LOCKED" } when the
 * permission is held but the session isn't unlocked, so the client can
 * show the password prompt.
 */
export function withInboxAccess<P = Record<string, string>>(
  fn: (req: NextRequest, ctx: RouteContext<P>) => Promise<Response>,
) {
  return withPermission<P>("inbox.access", async (req, ctx) => {
    if (!(await isInboxUnlocked())) {
      return fail("Хабарлар қулфланган · Inbox locked — enter password", 403, {
        code: "INBOX_LOCKED",
      });
    }
    return fn(req, ctx);
  });
}
```

- [ ] **Step 4: Implement `src/app/api/inbox/unlock/route.ts`:**

```ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { verifyInboxPassword, setInboxUnlockCookie, isInboxUnlocked } from "@/lib/inbox-auth";

// GET — report whether this session is already unlocked (owner-only).
export const GET = withPermission("inbox.access", async () => {
  return ok({ unlocked: await isInboxUnlocked() });
});

const Body = z.object({ password: z.string().min(1) });

// POST — verify the password and set the unlock cookie.
export const POST = withPermission("inbox.access", async (req: NextRequest) => {
  const { password } = Body.parse(await req.json());
  if (!verifyInboxPassword(password)) {
    return fail("Нотўғри парол · Wrong password", 401);
  }
  await setInboxUnlockCookie();
  return ok({ unlocked: true });
});
```

- [ ] **Step 5: Run all tests + typecheck**

Run: `cd precast-crm && npx vitest run tests/inbox-auth.test.ts && npx tsc --noEmit`
Expected: tests PASS; tsc shows no new errors (the Task 5 `isInboxUnlocked` import now resolves).

- [ ] **Step 6: Commit**

```bash
git add precast-crm/src/lib/inbox-auth.ts precast-crm/src/app/api/inbox/unlock/route.ts precast-crm/tests/inbox-auth.test.ts
git commit -m "feat(inbox) · password-unlock cookie + withInboxAccess gate + unlock route"
```

---

## Task 7: Webhook ingestion route

**Files:**
- Create: `precast-crm/src/app/api/telegram/webhook/route.ts`

- [ ] **Step 1: Implement the route:**

```ts
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import path from "path";
import { prisma } from "@/lib/prisma";
import { parseBusinessUpdate, type ParsedMedia } from "@/lib/telegram/parse";
import { isValidWebhookSecret } from "@/lib/telegram/webhook-secret";
import { tgGetFilePath, tgDownloadFile, TELEGRAM_MAX_DOWNLOAD_BYTES } from "@/lib/telegram/api";
import { saveBufferToUploads } from "@/lib/uploads";
import { emitInbox } from "@/lib/inbox-bus";

const EXT_BY_KIND: Record<string, string> = {
  IMAGE: ".jpg", VIDEO: ".mp4", VIDEO_NOTE: ".mp4", VOICE: ".ogg", AUDIO: ".mp3", DOCUMENT: "",
};

function snippetFor(text: string | null, media: ParsedMedia | null): string {
  if (text && text.trim()) return text.trim().slice(0, 80);
  if (!media) return "";
  switch (media.kind) {
    case "IMAGE": return "[Расм · Photo]";
    case "VIDEO": return "[Видео · Video]";
    case "VIDEO_NOTE": return "[Видео · Round video]";
    case "VOICE": return "[Овоз · Voice]";
    case "AUDIO": return "[Аудио · Audio]";
    case "DOCUMENT": return `[Файл · ${media.fileName ?? "Document"}]`;
    case "LOCATION": return "[Жойлашув · Location]";
    default: return "[Хабар · Message]";
  }
}

export async function POST(req: NextRequest) {
  // 1. Authenticate by secret-token header (fail closed).
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (!isValidWebhookSecret(secret, process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return new Response("forbidden", { status: 401 });
  }

  // 2. Parse. Malformed / non-business updates are acked with 200 so
  //    Telegram doesn't retry a permanently-unprocessable update.
  const update = await req.json().catch(() => null);
  const parsed = update ? parseBusinessUpdate(update) : null;
  if (!parsed || !parsed.chatId) return new Response("ok");

  try {
    // 3. Upsert the conversation.
    const conversation = await prisma.conversation.upsert({
      where: { channel_externalId: { channel: "TELEGRAM", externalId: parsed.chatId } },
      create: {
        channel: "TELEGRAM",
        externalId: parsed.chatId,
        businessConnectionId: parsed.businessConnectionId,
        displayName: parsed.displayName,
        username: parsed.username,
        lastMessageAt: new Date(),
        lastSnippet: snippetFor(parsed.text, parsed.media),
        unread: true,
      },
      update: {
        displayName: parsed.displayName,
        username: parsed.username,
        businessConnectionId: parsed.businessConnectionId,
        lastMessageAt: new Date(),
        lastSnippet: snippetFor(parsed.text, parsed.media),
        unread: true,
      },
    });

    // 4. Edited message → update text in place if we have it; else fall through to insert.
    if (parsed.isEdited) {
      const existing = await prisma.message.findUnique({
        where: { conversationId_telegramMsgId: { conversationId: conversation.id, telegramMsgId: parsed.telegramMsgId } },
        select: { id: true },
      });
      if (existing) {
        await prisma.message.update({ where: { id: existing.id }, data: { text: parsed.text } });
        emitInbox({ type: "message:edited", conversationId: conversation.id, messageId: existing.id });
        return new Response("ok");
      }
    }

    // 5. Resolve media (download ≤ limit; placeholder otherwise). Never throws out of the route.
    let mediaPath: string | null = null;
    let mediaName: string | null = parsed.media?.fileName ?? null;
    let mediaMeta: Record<string, unknown> | null = parsed.media?.meta ?? null;
    const mediaKind = parsed.media?.kind ?? null;

    if (parsed.media && parsed.media.fileId && parsed.media.kind !== "LOCATION" && parsed.media.kind !== "OTHER") {
      const size = parsed.media.fileSize ?? 0;
      if (size > 0 && size <= TELEGRAM_MAX_DOWNLOAD_BYTES) {
        try {
          const filePath = await tgGetFilePath(parsed.media.fileId);
          const buf = await tgDownloadFile(filePath);
          const ext = path.extname(filePath) || EXT_BY_KIND[parsed.media.kind] || "";
          const fname = `${parsed.telegramMsgId}${ext}`;
          mediaPath = await saveBufferToUploads(buf, `inbox/${conversation.id}`, fname);
        } catch {
          mediaMeta = { ...(mediaMeta ?? {}), unavailable: true };
        }
      } else {
        mediaMeta = { ...(mediaMeta ?? {}), oversize: true };
      }
    }

    // 6. Insert the inbound message (dedupe on (conversationId, telegramMsgId)).
    const message = await prisma.message.upsert({
      where: { conversationId_telegramMsgId: { conversationId: conversation.id, telegramMsgId: parsed.telegramMsgId } },
      create: {
        conversationId: conversation.id,
        direction: "INBOUND",
        text: parsed.text,
        mediaKind: mediaKind as never,
        mediaPath,
        mediaName,
        mediaMeta: mediaMeta as never,
        telegramMsgId: parsed.telegramMsgId,
      },
      update: {}, // duplicate delivery — no-op
      select: { id: true, createdAt: true },
    });

    // 7. Notify live listeners.
    emitInbox({ type: "message:new", conversationId: conversation.id, messageId: message.id });
  } catch (err) {
    // Log but still 200 — a 500 makes Telegram retry the same update for 24h.
    console.error("[telegram webhook]", err);
  }

  return new Response("ok");
}
```

- [ ] **Step 2: Verify compile**

Run: `cd precast-crm && npx tsc --noEmit`
Expected: no new errors. (The `as never` casts on `mediaKind`/`mediaMeta` sidestep Prisma's enum/Json input typing; acceptable and localized.)

- [ ] **Step 3: Commit**

```bash
git add precast-crm/src/app/api/telegram/webhook/route.ts
git commit -m "feat(inbox) · Telegram webhook ingestion (parse, upsert, media, SSE)"
```

---

## Task 8: Inbox JSON APIs (list, messages, reply)

**Files:**
- Create: `precast-crm/src/app/api/inbox/route.ts`
- Create: `precast-crm/src/app/api/inbox/[id]/route.ts`
- Create: `precast-crm/src/app/api/inbox/[id]/reply/route.ts`

- [ ] **Step 1: Conversation list — `src/app/api/inbox/route.ts`:**

```ts
import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { withInboxAccess } from "@/lib/inbox-auth";

export const GET = withInboxAccess(async () => {
  const conversations = await prisma.conversation.findMany({
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    select: {
      id: true, displayName: true, username: true,
      lastMessageAt: true, lastSnippet: true, unread: true,
    },
  });
  return ok(conversations);
});
```

- [ ] **Step 2: Messages for a conversation (and mark read) — `src/app/api/inbox/[id]/route.ts`:**

```ts
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { withInboxAccess } from "@/lib/inbox-auth";

export const GET = withInboxAccess<{ id: string }>(async (_req, { params }) => {
  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
    select: { id: true, displayName: true, username: true, externalId: true },
  });
  if (!conversation) return fail("Суҳбат топилмади · Conversation not found", 404);

  const messages = await prisma.message.findMany({
    where: { conversationId: params.id },
    orderBy: { createdAt: "asc" },
    take: 500,
    select: {
      id: true, direction: true, text: true, mediaKind: true,
      mediaPath: true, mediaName: true, mediaMeta: true, failed: true, createdAt: true,
    },
  });

  // Opening a conversation clears its unread flag.
  await prisma.conversation.update({ where: { id: params.id }, data: { unread: false } });

  return ok({ conversation, messages });
});
```

- [ ] **Step 3: Reply — `src/app/api/inbox/[id]/reply/route.ts`:**

```ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { withInboxAccess } from "@/lib/inbox-auth";
import { tgSendBusinessMessage } from "@/lib/telegram/api";
import { emitInbox } from "@/lib/inbox-bus";

const Body = z.object({ text: z.string().trim().min(1).max(4000) });

export const POST = withInboxAccess<{ id: string }>(async (req: NextRequest, { params, user }) => {
  const { text } = Body.parse(await req.json());

  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
    select: { id: true, externalId: true, businessConnectionId: true },
  });
  if (!conversation) return fail("Суҳбат топилмади · Conversation not found", 404);
  if (!conversation.businessConnectionId) {
    return fail("Бизнес уланиш мавжуд эмас · No business connection for this chat", 400);
  }

  let telegramMsgId: string | null = null;
  let failed = false;
  try {
    const sent = await tgSendBusinessMessage(conversation.businessConnectionId, conversation.externalId, text);
    telegramMsgId = sent.messageId;
  } catch (err) {
    console.error("[inbox reply]", err);
    failed = true; // persist as a failed bubble so the UI can offer retry
  }

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "OUTBOUND",
      text,
      telegramMsgId,
      sentById: user.id,
      failed,
    },
    select: { id: true, direction: true, text: true, failed: true, createdAt: true },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), lastSnippet: text.slice(0, 80), unread: false },
  });

  emitInbox({ type: "message:new", conversationId: conversation.id, messageId: message.id });

  if (failed) return fail("Юборилмади · Send failed", 502, { message });
  return ok(message);
});
```

- [ ] **Step 4: Verify compile**

Run: `cd precast-crm && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add precast-crm/src/app/api/inbox/route.ts "precast-crm/src/app/api/inbox/[id]/route.ts" "precast-crm/src/app/api/inbox/[id]/reply/route.ts"
git commit -m "feat(inbox) · list/messages/reply JSON APIs (inbox.access + unlock gated)"
```

---

## Task 9: Navigation + route gating + page wrapper

**Files:**
- Modify: `precast-crm/src/lib/page-auth.ts`
- Modify: `precast-crm/src/components/sidebar.tsx`
- Create: `precast-crm/src/app/(app)/inbox/page.tsx`

- [ ] **Step 1: Gate the route.** In `src/lib/page-auth.ts`, add to `ROUTE_PERMISSIONS` (before `/profile`):

```ts
  "/inbox": "inbox.access",
```

- [ ] **Step 2: Add the nav item.** In `src/components/sidebar.tsx`, import `MessageCircle` from `lucide-react` (add to the existing lucide import list), then add to the `NAV` array (after the `/activity` entry):

```ts
  {
    href: "/inbox",
    label: "Хабарлар",
    sub: "Inbox",
    icon: MessageCircle,
    permission: "inbox.access",
  },
```

(If `NavItem` entries in this file don't use a `sub` field, omit it — match the surrounding entries exactly.)

- [ ] **Step 3: Create the server wrapper `src/app/(app)/inbox/page.tsx`:**

```tsx
import { InboxClient } from "./InboxClient";

export default function InboxPage() {
  return <InboxClient />;
}
```

- [ ] **Step 4: Verify compile** (will report unresolved `./InboxClient` until Task 10 — expected).

Run: `cd precast-crm && npx tsc --noEmit`
Expected: only an unresolved `./InboxClient` import; no other new errors.

- [ ] **Step 5: Commit**

```bash
git add precast-crm/src/lib/page-auth.ts precast-crm/src/components/sidebar.tsx "precast-crm/src/app/(app)/inbox/page.tsx"
git commit -m "feat(inbox) · sidebar nav, /inbox route gate, page wrapper"
```

---

## Task 10: Media renderer components

**Files:**
- Create: `precast-crm/src/components/inbox/MediaRenderers.tsx`

- [ ] **Step 1: Implement the renderers.** One component per `MediaKind`, dispatched by a switch. Location needs no file; oversize/unavailable render placeholders.

```tsx
"use client";

import { MapPin, FileText, Download, AlertCircle } from "lucide-react";

export interface MessageMediaProps {
  mediaKind: string | null;
  mediaPath: string | null;
  mediaName: string | null;
  mediaMeta: Record<string, unknown> | null;
}

export function MessageMedia({ mediaKind, mediaPath, mediaName, mediaMeta }: MessageMediaProps) {
  if (!mediaKind) return null;

  const meta = mediaMeta ?? {};
  if (meta.unavailable) return <Placeholder label="Медиа юкланмади · Media unavailable" />;
  if (meta.oversize) return <Placeholder label="Файл катта — Telegram'да очинг · Too large — open in Telegram" />;

  switch (mediaKind) {
    case "IMAGE":
      return mediaPath ? (
        <a href={mediaPath} target="_blank" rel="noreferrer">
          <img src={mediaPath} alt={mediaName ?? "image"} className="max-w-[260px] rounded-lg" />
        </a>
      ) : null;

    case "VIDEO":
      return mediaPath ? (
        <video src={mediaPath} controls className="max-w-[280px] rounded-lg" />
      ) : null;

    case "VIDEO_NOTE":
      return mediaPath ? (
        <video src={mediaPath} controls className="h-[200px] w-[200px] rounded-full object-cover" />
      ) : null;

    case "VOICE":
    case "AUDIO":
      return mediaPath ? (
        <div className="flex flex-col gap-1">
          {mediaKind === "AUDIO" && meta.title ? (
            <span className="text-xs text-muted-foreground">{String(meta.title)}</span>
          ) : null}
          <audio src={mediaPath} controls className="max-w-[260px]" />
          {typeof meta.duration === "number" ? (
            <span className="text-[10px] text-muted-foreground">{formatDuration(meta.duration)}</span>
          ) : null}
        </div>
      ) : null;

    case "DOCUMENT":
      return mediaPath ? (
        <a
          href={mediaPath}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate max-w-[200px]">{mediaName ?? "document"}</span>
          <Download className="h-4 w-4 shrink-0 opacity-60" />
        </a>
      ) : null;

    case "LOCATION": {
      const lat = meta.lat as number | undefined;
      const lng = meta.lng as number | undefined;
      if (lat == null || lng == null) return null;
      const url = `https://maps.google.com/?q=${lat},${lng}`;
      return (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <span className="flex flex-col">
            <span className="font-medium">{(meta.title as string) ?? "Жойлашув · Location"}</span>
            {meta.address ? <span className="text-xs text-muted-foreground">{String(meta.address)}</span> : null}
            <span className="text-xs text-primary">Open in Google Maps</span>
          </span>
        </a>
      );
    }

    default:
      return <Placeholder label="Қўллаб-қувватланмайди · Unsupported message" />;
  }
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
      <AlertCircle className="h-3.5 w-3.5" />
      {label}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
```

- [ ] **Step 2: Verify compile**

Run: `cd precast-crm && npx tsc --noEmit`
Expected: no new errors in this file.

- [ ] **Step 3: Commit**

```bash
git add precast-crm/src/components/inbox/MediaRenderers.tsx
git commit -m "feat(inbox) · per-MediaKind renderers (image/video/voice/doc/location)"
```

---

## Task 11: Inbox UI (lock gate + two-pane + live + reply)

**Files:**
- Create: `precast-crm/src/app/(app)/inbox/InboxClient.tsx`

- [ ] **Step 1: Implement the client.** Lock gate first (password prompt → unlock), then the two-pane inbox with React Query data, an `EventSource` SSE subscription that invalidates queries, and a reply box.

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { Loader2, Lock, Send, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MessageMedia } from "@/components/inbox/MediaRenderers";

interface ConversationSummary {
  id: string; displayName: string; username: string | null;
  lastMessageAt: string; lastSnippet: string; unread: boolean;
}
interface InboxMessage {
  id: string; direction: "INBOUND" | "OUTBOUND"; text: string | null;
  mediaKind: string | null; mediaPath: string | null; mediaName: string | null;
  mediaMeta: Record<string, unknown> | null; failed: boolean; createdAt: string;
}

export function InboxClient() {
  const qc = useQueryClient();

  // ── Lock gate ──────────────────────────────────────────────────
  const { data: unlockState, isLoading: unlockLoading } = useQuery({
    queryKey: ["inbox-unlock"],
    queryFn: () => api<{ unlocked: boolean }>("/api/inbox/unlock"),
    retry: false,
  });

  if (unlockLoading) return <Centered><Loader2 className="h-5 w-5 animate-spin" /></Centered>;
  if (!unlockState?.unlocked) return <LockScreen onUnlocked={() => qc.invalidateQueries({ queryKey: ["inbox-unlock"] })} />;

  return <Inbox />;
}

function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => api("/api/inbox/unlock", { method: "POST", json: { password } }),
    onSuccess: onUnlocked,
    onError: (e: Error) => setError(e.message),
  });
  return (
    <Centered>
      <form
        onSubmit={(e) => { e.preventDefault(); setError(null); m.mutate(); }}
        className="flex w-full max-w-xs flex-col gap-3 rounded-xl border border-border p-6"
      >
        <div className="flex items-center gap-2 font-semibold"><Lock className="h-4 w-4" /> Хабарлар қулфланган</div>
        <p className="text-xs text-muted-foreground">Кириш учун паролни киритинг · Enter the password to open the inbox.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder="••••••••"
        />
        {error && <span className="text-xs text-destructive">{error}</span>}
        <Button type="submit" size="sm" disabled={m.isPending || !password}>
          {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Очиш · Unlock"}
        </Button>
      </form>
    </Centered>
  );
}

function Inbox() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: conversations } = useQuery({
    queryKey: ["inbox-conversations"],
    queryFn: () => api<ConversationSummary[]>("/api/inbox"),
    refetchInterval: 60_000,
  });

  // Live updates: invalidate the list + the open thread on any inbox event.
  useEffect(() => {
    const es = new EventSource("/api/inbox/stream");
    es.onmessage = () => {
      qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
      qc.invalidateQueries({ queryKey: ["inbox-thread"] });
    };
    es.onerror = () => { /* browser auto-reconnects */ };
    return () => es.close();
  }, [qc]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold tracking-tight">Хабарлар<span className="text-muted-foreground"> · Inbox</span></h1>
      <div className="flex h-[calc(100vh-180px)] overflow-hidden rounded-xl border border-border">
        {/* Left: conversation list */}
        <div className="w-[320px] shrink-0 overflow-y-auto border-r border-border">
          {(conversations ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={cn(
                "flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left hover:bg-muted",
                activeId === c.id && "bg-muted",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-medium">
                  {c.unread && <span className="h-2 w-2 rounded-full bg-primary" />}
                  {c.displayName}
                </span>
                <span className="text-[10px] text-muted-foreground">{timeAgo(c.lastMessageAt)}</span>
              </div>
              <span className="truncate text-xs text-muted-foreground">{c.lastSnippet}</span>
            </button>
          ))}
          {conversations && conversations.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">Ҳозирча хабарлар йўқ · No messages yet</div>
          )}
        </div>

        {/* Right: thread */}
        <div className="flex flex-1 flex-col">
          {activeId ? <Thread conversationId={activeId} /> : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              <span className="flex flex-col items-center gap-2"><MessageCircle className="h-6 w-6" /> Суҳбатни танланг · Select a conversation</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Thread({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["inbox-thread", conversationId],
    queryFn: () => api<{ conversation: ConversationSummary; messages: InboxMessage[] }>(`/api/inbox/${conversationId}`),
  });

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [data?.messages.length]);

  const reply = useMutation({
    mutationFn: (text: string) => api(`/api/inbox/${conversationId}/reply`, { method: "POST", json: { text } }),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["inbox-thread", conversationId] });
      qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
    },
  });

  return (
    <>
      <div className="border-b border-border px-4 py-3">
        <div className="font-semibold">{data?.conversation.displayName}</div>
        {data?.conversation.username && <div className="text-xs text-muted-foreground">@{data.conversation.username}</div>}
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {(data?.messages ?? []).map((msg) => (
          <div key={msg.id} className={cn("flex", msg.direction === "OUTBOUND" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[70%] rounded-2xl px-3 py-2 text-sm",
              msg.direction === "OUTBOUND" ? "bg-primary text-primary-foreground" : "bg-muted",
              msg.failed && "border border-destructive",
            )}>
              <MessageMedia mediaKind={msg.mediaKind} mediaPath={msg.mediaPath} mediaName={msg.mediaName} mediaMeta={msg.mediaMeta} />
              {msg.text && <div className={cn(msg.mediaKind && "mt-1")}>{msg.text}</div>}
              <div className="mt-0.5 flex items-center gap-1 text-[10px] opacity-60">
                {clock(msg.createdAt)}
                {msg.failed && <span className="text-destructive">· юборилмади</span>}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); if (draft.trim()) reply.mutate(draft.trim()); }}
        className="flex items-center gap-2 border-t border-border p-3"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Жавоб ёзинг…"
          className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm"
        />
        <Button type="submit" size="sm" disabled={reply.isPending || !draft.trim()}>
          {reply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-[60vh] items-center justify-center">{children}</div>;
}
function clock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
```

- [ ] **Step 2: Verify compile**

Run: `cd precast-crm && npx tsc --noEmit`
Expected: no new errors (the `./InboxClient` import in `page.tsx` now resolves).

- [ ] **Step 3: Build to confirm the client bundles**

Run: `cd precast-crm && npx next build`
Expected: build completes; `/inbox` appears in the route list as a dynamic route.

- [ ] **Step 4: Commit**

```bash
git add "precast-crm/src/app/(app)/inbox/InboxClient.tsx"
git commit -m "feat(inbox) · inbox UI — lock gate, two-pane, SSE live, reply box"
```

---

## Task 12: Final verification + Telegram registration recipe

**Files:** none (verification + docs).

- [ ] **Step 1: Full test + typecheck + build**

Run: `cd precast-crm && npx vitest run && npx tsc --noEmit && npx next build`
Expected: all tests pass (the pre-existing 1 skipped remains skipped); no new tsc errors; clean build.

- [ ] **Step 2: Register the webhook (after deploy, once env vars are set).** This is operational — run against production once `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` are configured:

```bash
curl -s "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<your-host>/api/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
    "allowed_updates": ["business_connection", "business_message", "edited_business_message"]
  }'
# Expect: {"ok":true,"result":true,"description":"Webhook was set"}
```

Then in the Telegram app: **Settings → Business → Chatbots**, connect the bot, and **scope which chats it manages** (exclude personal contacts) so private chats are never ingested.

- [ ] **Step 3: Manual acceptance recipe**

  1. As OWNER, open the sidebar → **Хабарлар · Inbox** is visible. As a non-owner, it is NOT visible (and `/inbox` redirects home).
  2. The inbox shows a password prompt; a wrong password is rejected; the correct `INBOX_PASSWORD` unlocks it.
  3. From a second phone, DM the connected business account: a text, a photo, a voice note, a round video, a file video, a PDF, and a location. Each appears in the inbox and renders/plays correctly (location shows an "Open in Google Maps" link).
  4. Reply from the CRM; confirm it arrives in the client's Telegram as the business account.
  5. Confirm the conversation jumps to the top with an unread dot on a new inbound message without refreshing (SSE).

- [ ] **Step 4: Commit any doc tweaks and push the branch**

```bash
git push -u origin feat/telegram-business-inbox
```

---

## Out of scope (do NOT build here)

- AI auto-reply + escalation (subsystem #2).
- Extracting dimensions from a drawing into the calculator (subsystem #3).
- Instagram channel.
- Per-operator assignment, canned replies, tags/labels, history search, outbound media.
