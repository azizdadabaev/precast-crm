# Telegram Business Inbox — Design (Subsystem #1)

**Status:** Approved design, pre-implementation
**Date:** 2026-06-01
**Part of:** a larger "respond.io-style customer conversation layer" decomposed into
independent subsystems. This is **#1, the foundation**. Later cycles: #2 AI
auto-responder + escalation, #3 drawing → calculator dimension extraction,
\+ Instagram as a second channel. Each gets its own spec → plan → build.

---

## Goal

Every Telegram message a client sends to the owner's business account appears in a
**single CRM inbox** where the owner reads and replies in real time — shortening
client wait time and ending the scatter of leads across a personal phone. Incoming
media (drawings, photos, voice, video, PDFs, locations) is captured and played back
in-thread so a drawing is immediately actionable.

This subsystem is **conversation infrastructure only**. It does not interpret
messages (that's #2) and does not extract dimensions from drawings (that's #3).

## Non-goals (explicitly deferred to later subsystems)

- AI auto-reply or "AI can't understand → notify me" escalation (#2)
- Extracting room dimensions from a drawing into the calculator (#3)
- Instagram channel (+)
- Per-operator assignment, canned replies, tags/labels, search across history
- Linking a conversation to a CRM Client record (see "Conversations are standalone")

---

## Confirmed decisions

| Decision | Choice | Rationale |
|---|---|---|
| Channel model | **Telegram Business connection** | Clients keep messaging the owner's normal account; nothing changes for them. Requires owner to hold **Telegram Premium**. |
| Reply direction | **Read-write** — reply from inside the CRM | Single place to read and respond; same outbound plumbing #2 (AI) needs. |
| Conversation ↔ Client | **Standalone — no link** | Ordinary Q&A creates no CRM record. Client/Project are created only later when a calculation is saved (existing phone-required Save-Project rule). |
| Where it runs | **Webhook → Next.js API route** | No new always-on service; reuses Caddy TLS. The `ws-bridge` stays dedicated to Blender. |
| Visibility | **OWNER-only permission + per-session password unlock** | Owner uses one personal+business Telegram account; no staff should read it. Password defends shared factory PCs. |
| Personal-chat privacy | **Telegram Business chat-scoping (setup step)** | Personal-life chats are excluded at the Telegram level so they are *never ingested*, rather than ingested and hidden. |

---

## Architecture

```
Client's Telegram ──DM──► Owner's Telegram (Business account · Premium)
                               │  business_connection (scoped to business chats only)
                               ▼
                      Telegram Bot API servers
                               │  HTTPS POST: business_message / edited_business_message
                               │  header X-Telegram-Bot-Api-Secret-Token
                               ▼
                Caddy ──► Next.js  POST /api/telegram/webhook
                               │  1. verify secret-token header
                               │  2. upsert Conversation, insert Message (dedupe on telegramMsgId)
                               │  3. if media ≤ ~20MB: getFile → download → uploads volume
                               │  4. emit SSE event
                               ▼
                           Postgres  +  uploads volume (Caddy serves /uploads/*)
              ┌────────────────┴─────────────────┐
              ▼                                   ▼
     SSE  GET /api/inbox/stream         Reply: POST /api/inbox/[id]/reply
     (live push to inbox UI)            → Bot API sendMessage(business_connection_id)
                                        → persist OUTBOUND Message  → SSE echo
```

**Why webhook, not the ws-bridge:** zero new services, reuses the Caddy TLS already
terminating HTTPS, and outbound is a server-side `fetch` to the Bot API. A dedicated
service only earns its keep if we later need long-polling resilience or Instagram's
different push model — and that move won't change this data model.

---

## Data model (Prisma — 2 new models, 0 changes to existing models)

```prisma
enum ConversationChannel { TELEGRAM }                       // INSTAGRAM added later
enum MessageDirection    { INBOUND OUTBOUND }
enum MediaKind           { IMAGE VIDEO VIDEO_NOTE VOICE AUDIO DOCUMENT LOCATION OTHER }

model Conversation {
  id                   String   @id @default(cuid())
  channel              ConversationChannel @default(TELEGRAM)
  externalId           String   // Telegram user/chat id — standalone, NOT a CRM Client
  businessConnectionId String?  // which business connection this thread belongs to
  displayName          String   // name from Telegram
  username             String?  // @handle if present
  lastMessageAt        DateTime
  lastSnippet          String   @default("")
  unread               Boolean  @default(true)
  messages             Message[]
  createdAt            DateTime @default(now())

  @@unique([channel, externalId])
  @@index([lastMessageAt])
}

model Message {
  id             String   @id @default(cuid())
  conversationId String
  direction      MessageDirection
  text           String?              // caption or text body
  mediaKind      MediaKind?
  mediaPath      String?              // path in uploads volume (null for LOCATION / text-only)
  mediaName      String?              // original filename / "voice.ogg" etc.
  mediaMeta      Json?                // LOCATION: { lat, lng, title?, address? }; duration for voice/video; oversize flag
  telegramMsgId  String?              // dedupe — Telegram re-POSTs unacked updates for 24h
  sentById       String?              // operator (OUTBOUND only) → User
  failed         Boolean  @default(false)  // OUTBOUND send failed; UI shows retry
  createdAt      DateTime @default(now())

  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  sentBy         User?        @relation(fields: [sentById], references: [id])

  @@index([conversationId, createdAt])
  @@unique([conversationId, telegramMsgId])   // dedupe key (telegramMsgId null allowed for OUTBOUND)
}
```

**Conversations are standalone.** No `clientId` FK. An optional one can be added in a
later cycle without breaking anything; it is out of scope now.

Additive only — applied with `prisma db push` (prototyping mode, no migrations folder).

---

## Telegram Business setup (operational, one-time)

1. Owner subscribes to **Telegram Premium**.
2. Create a bot via **@BotFather**; obtain `TELEGRAM_BOT_TOKEN`.
3. In Telegram **Settings → Business → Chatbots**, connect the bot to the account.
4. **Scope which chats the bot manages** — set to specific business chats or
   "all except my contacts" so **personal-life conversations are never delivered to
   the bot** (privacy boundary lives here, at the source).
5. Register the webhook: `setWebhook` with the public Caddy URL
   `https://<host>/api/telegram/webhook` and a `secret_token`
   (stored as `TELEGRAM_WEBHOOK_SECRET`), subscribing to `business_connection`,
   `business_message`, and `edited_business_message` update types.

New env vars: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `INBOX_PASSWORD`.

---

## Webhook ingestion (`POST /api/telegram/webhook`)

1. **Authenticate:** reject unless `X-Telegram-Bot-Api-Secret-Token` equals
   `TELEGRAM_WEBHOOK_SECRET` (401). This is the only public, unauthenticated-by-JWT
   route in the feature; the secret-token header is its guard.
2. **Parse** `business_message` (and `edited_business_message`) into a normalized
   shape via a pure function (unit-tested). Capture `business_connection_id`, sender
   identity, text/caption, and media descriptor.
3. **Upsert Conversation** by `(channel, externalId)`; update `displayName`,
   `lastMessageAt`, `lastSnippet`, set `unread = true`.
4. **Insert Message** (INBOUND). Dedupe on `(conversationId, telegramMsgId)` so
   Telegram's 24h retry of unacked updates never double-inserts.
5. **Media:** if the message carries media and its size is ≤ the Bot API download
   limit (~20 MB — verify exact value at implementation), call `getFile` → download →
   store under the uploads volume (same place delivery photos live). Classify into
   `MediaKind`. For `location`/`venue` there is no file — store coordinates in
   `mediaMeta`. Oversize media: store the message with `mediaMeta.oversize = true` and
   render an "open in Telegram" placeholder (never drop the message).
6. **Emit SSE** so any open inbox updates live.
7. Return `200` even when media download fails (Telegram retries non-200, which would
   re-deliver the whole update). The CRM runs as a persistent Next.js standalone (not
   serverless) and Telegram's webhook timeout is generous, so awaiting a ≤20 MB
   download before the 200 is acceptable; a download failure still returns 200 and
   leaves a "media unavailable" placeholder rather than a dropped message.

---

## Media rendering (best-messenger conventions)

| `MediaKind` | Source Telegram type | UI |
|---|---|---|
| IMAGE | `photo` | thumbnail → lightbox (reuse `GalleryLightbox`) |
| VIDEO | `video` | inline `<video>` with controls |
| VIDEO_NOTE | `video_note` | **circular** tap-to-play player |
| VOICE | `voice` | inline voice player: play/pause, duration, waveform |
| AUDIO | `audio` | audio player with track title |
| DOCUMENT | `document` (PDF/CAD/etc.) | download chip (name + size); PDF opens inline |
| LOCATION | `location` / `venue` | static map thumbnail + **"Open in Google Maps"** link (`https://maps.google.com/?q=<lat>,<lng>`); venue adds title/address |
| OTHER | unsupported | text fallback "[unsupported message type]" |

Voice/video use OGG-Opus / MP4; browsers handle these natively (verify Safari voice
playback during testing; provide a download fallback if needed).

---

## Outbound reply (`POST /api/inbox/[id]/reply`)

- Body: `{ text }` (v1 sends text only; sending media out is a later refinement).
- Server calls Bot API `sendMessage` with the conversation's stored
  `businessConnectionId` so the reply is sent **as the business account**.
- Persist an OUTBOUND Message; optimistic bubble in the UI reconciles on success.
- On API failure, mark `failed = true`; the bubble shows a red **retry** state
  (mirrors the Blender button's failed lifecycle).

---

## Access control (defense in depth)

1. **Permission gate:** new action `inbox.access`, granted **only to the OWNER role
   template** (same posture as `blender.bridge` in `lib/permissions.ts`). No other
   role's login can see the sidebar tab or call the inbox APIs.
2. **Per-session password unlock:**
   - `POST /api/inbox/unlock { password }` verifies against `INBOX_PASSWORD` (env);
     on success sets a signed, httpOnly, short-TTL cookie `inbox_unlock`.
   - All `/api/inbox/*` routes require **both** the `inbox.access` permission **and**
     a valid `inbox_unlock` cookie, else 403 with an "unlock required" hint.
   - The inbox page renders a password prompt when locked; on success it reveals the
     inbox. Clears on tab close / TTL expiry so a shared PC re-prompts.
3. **Personal-chat scoping:** Telegram Business chat-scoping (setup step 4) keeps
   personal threads out of ingestion entirely.

The webhook route is exempt from #1/#2 (Telegram can't send a JWT) — it is guarded by
the secret-token header instead.

---

## Inbox UI

- **New sidebar item** "Хабарлар · Inbox" with an unread badge — visible only with
  `inbox.access`.
- **Two-pane** layout (same pattern as the table designer / `CommentThread`):
  conversation list (left) + thread (right) + reply box.
- **Chat design:** day separators, grouped consecutive bubbles, inbound left /
  outbound right, timestamps, inline media per the table above.
- **Live:** SSE (`GET /api/inbox/stream`) reusing the Notifications-stream pattern —
  new inbound bumps the thread to top, sets the unread dot, optional sound via the
  existing `AudioUnlocker`. Opening a thread clears `unread`.

```
┌──────────────────────┬─────────────────────────────────────────┐
│ Хабарлар · Inbox     │  Алишер   @alisher_t                      │
├──────────────────────┼─────────────────────────────────────────┤
│ ● Алишер  · 2m       │  ── Бугун ──                              │
│   "narxi qancha?"    │  narxi qancha?                      9:02  │ ◄ inbound text
│ ──────────────────── │  [🗎 drawing.pdf · 240 KB]          9:03  │ ◄ inbound document
│ ● Дилноза · 5m       │  ▶ 0:07  voice ▁▂▆▇▃▁              9:03  │ ◄ inbound voice
│   "[Овоз] 0:07"      │  📍 Yunusobod → Open in Google Maps 9:04  │ ◄ inbound location
│ ──────────────────── │            Assalomu alaykum! 250k/m² 9:05 │ ◄ outbound
│   Бобур   · 1h       │  ┌─────────────────────────────────────┐ │
│   "rahmat"           │  │ Жавоб ёзинг…                  [Юбор] │ │
└──────────────────────┴─────────────────────────────────────────┘
```

---

## Error handling

- Webhook: wrong/absent secret token → 401; malformed update → log + 200 (don't make
  Telegram retry a permanently-bad update).
- Media download failure or oversize → placeholder message, never a dropped row.
- Outbound failure → `failed = true`, retry affordance in the bubble.
- Dedupe via `(conversationId, telegramMsgId)` unique constraint.

---

## Testing

- **Pure unit tests:** update parser (`business_message` JSON → normalized
  Message/Conversation), `MediaKind` classification across all Telegram media types,
  location-meta extraction, dedupe-key behavior, webhook secret-token rejection,
  `inbox_unlock` cookie verification.
- **Manual recipe:** connect the bot to the business account with chat-scoping; DM
  from a second phone (text, photo, voice, round video, PDF, location); confirm each
  renders; reply from the CRM and confirm it arrives as the business account; confirm
  a non-owner login cannot see the tab; confirm the password unlock gates a shared PC.

---

## Risks / open questions (to resolve during implementation)

1. **Exact Bot API download size cap** for `getFile` (commonly cited ~20 MB) — verify
   and set the oversize threshold accordingly.
2. **Safari** voice/round-video playback of OGG-Opus / MP4 — confirm; add a download
   fallback if a format isn't supported.
3. **`edited_business_message` and message deletions** — v1 appends edits as new info
   or updates in place? Proposed: update the existing Message text in place when
   `telegramMsgId` matches; ignore deletions (out of scope) — confirm in planning.
4. **SSE fan-out** is single-instance (one Next.js container today) — fine now; note
   for any future horizontal scale.
```
