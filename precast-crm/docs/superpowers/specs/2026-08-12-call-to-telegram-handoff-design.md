# Call → Telegram handoff — design

**Date:** 2026-08-12
**Status:** Design approved; spec under review
**Parts:** A = CRM backend (ships first) · B = Android overlay app

## 1. Problem

During a phone call a customer asks for the factory location, installation videos,
product photos or the price list. Today the owner: ends the call → copies the
number → saves it as a Telegram contact → finds the chat → sends the media. That
is 1–2 minutes per call, and it happens *after* attention has moved on, so some
customers never receive the follow-up at all.

**The deeper goal is not automating copy-paste.** It is turning a phone call into a
*tracked, AI-handled Telegram conversation with zero post-call work*. Media sent
from the owner's phone is invisible to the CRM: the lead is untracked, the existing
AI agent cannot take over, and there is no attribution. The prize is routing the
caller into the pipeline that already exists.

## 2. The hard constraint (verified in code, not assumed)

Outbound Telegram is **Bot API over a Business connection**. `business_connection_id`
is mandatory on every customer-facing send, enforced at four guard sites:
`src/lib/inbox-send.ts:51,119,222,359`.

That ID is obtainable **only from an inbound Telegram update** for that exact chat
(`src/app/api/telegram/webhook/route.ts:133`, parsed at `src/lib/telegram/parse.ts:132`).

Consequences, all confirmed by inspection:

- Every send is addressed by `Conversation.id` → `externalId`. **No code path accepts
  a phone number or a username as a destination.**
- `Conversation` rows are created **only** by the two inbound webhooks. The single
  other creator is the local `sim-` fake
  (`src/app/api/agent/simulate-inbound/route.ts:47`), which never reaches Telegram.
- There is **no MTProto/TDLib client** in the project, so there is no way to act as
  the owner's user account and message a phone number directly.

**Therefore the customer must send the first message. That is a technical fact, not
a product preference.**

A second, non-obvious constraint: **Telegram never reveals the sender's phone
number.** `Conversation.sharedContactPhone` (`prisma/schema.prisma:1207`) is
populated only when a customer voluntarily shares a contact card. So an inbound
message cannot, by itself, be matched to the number that was just called.

## 3. Architecture — the token handshake

A short token is what stitches the phone call to the Telegram chat.

```
1. Call ends. Overlay bubble appears with the captured number.
2. Owner taps presets (Location / Videos / Photos / Price list).
3. App  → CRM:  POST /api/handoff  { phone, presets[] }
   CRM  → App:  { token: "A7K2M9", smsText: "...t.me/<acct>?text=A7K2M9" }
   CRM persists a PendingFollowUp row.
4. App sends that SMS from the device SIM.
5. Customer taps the link → Telegram opens the owner's chat with "A7K2M9"
   pre-filled → customer presses send.
6. Inbound webhook fires, carrying chat id AND business_connection_id.
   The handler finds the token in the message body, matches the
   PendingFollowUp, and now holds BOTH the chat and the phone number.
7. CRM links/creates the Client by phone, marks the follow-up CONSUMED,
   sends the requested media, and leaves the chat to the existing AI agent.
```

Everything after step 6 runs on machinery that already works.

## 4. Part A — CRM backend

### 4.1 Data model (additive; `prisma db push`)

```prisma
model PendingFollowUp {
  id             String    @id @default(cuid())
  token          String    @unique            // 6 chars, Crockford base32
  phone          String                       // normalized via normalizePhone()
  presets        String[]                     // LOCATION | VIDEOS | PHOTOS | PRICELIST
  status         String    @default("PENDING") // PENDING | CONSUMED | EXPIRED | CANCELED
  createdById    String?
  conversationId String?                      // set on match
  createdAt      DateTime  @default(now())
  consumedAt     DateTime?
  expiresAt      DateTime                     // createdAt + 7 days

  @@index([token])
  @@index([status, expiresAt])
  @@index([phone])
}
```

Token charset: `0-9A-Z` minus `I L O U` (Crockford base32 — avoids confusable
characters when read aloud or retyped) → ~1.07e9 combinations at 6 chars.
Collisions retry on unique violation. Matching is **case-insensitive** and uses a
word boundary, because the customer may type text around it.

### 4.2 Machine authentication (new — required)

No send route today accepts anything but a browser cookie: `withPermission` reads
`cookies()` only (`src/lib/api-auth.ts:35`, `src/lib/auth.ts:150-155`). A
Bearer-capable resolver already exists but is **dead code with zero call sites**:
`getUserFromRequest` (`src/lib/auth.ts:157-171`).

Add a **narrowly-scoped device token**, NOT a full user session:

- `HANDOFF_DEVICE_TOKEN` env var, compared in constant time.
- Grants exactly one capability: create a PendingFollowUp. It must NOT read
  conversations, send arbitrary messages, or reach any other route.
- Sent as `Authorization: Bearer <token>` to `POST /api/handoff` only.
- Rationale: this token lives on a phone that can be lost or stolen. The blast
  radius must be "someone can create a pending follow-up" and nothing more.

### 4.3 Endpoints

**`POST /api/handoff`** — device-token auth.
Body: `{ phone: string, presets: ("LOCATION"|"VIDEOS"|"PHOTOS"|"PRICELIST")[] }`

- Normalizes the phone with the existing `normalizePhone` (`src/lib/phone.ts:29`).
- Rejects an empty `presets` array.
- Rate-limited (e.g. 30/hour) so a leaked token cannot flood the table.
- Returns `{ token, smsText, expiresAt }`. The CRM composes `smsText` so the
  wording can change without shipping a new APK.

**`GET /api/handoff`** — normal cookie auth. Lists recent follow-ups and their
status, so the owner can see who never replied.

### 4.4 Webhook matching (`src/app/api/telegram/webhook/route.ts`)

After the existing conversation upsert, for **inbound (non-outgoing)** messages on
a conversation with no linked client:

1. Extract a candidate token: `/\b[0-9A-HJ-KMNP-TV-Z]{6}\b/i`.
2. Find a `PendingFollowUp` with that token, `status = PENDING`, `expiresAt > now`.
3. On match, in ONE transaction: set `status = CONSUMED`, `consumedAt`,
   `conversationId`; upsert the `Client` by normalized phone; link the conversation
   to that client.
4. Dispatch the preset media (§4.5).

Matching is attempted only on the **first few inbound messages** of a conversation,
so a stray 6-character word later in a long chat cannot consume a token.

### 4.5 Preset media

Stored as one `AppConfig` JSON row under key `"handoff.presets"` — the existing
key-value pattern, no migration (see `CLAUDE.md` §Data/Config):

```json
{
  "LOCATION":  { "lat": 40.9983, "lng": 71.6726, "caption": "..." },
  "VIDEOS":    { "fileIds": ["..."], "caption": "..." },
  "PHOTOS":    { "fileIds": ["..."], "caption": "..." },
  "PRICELIST": { "fileId": "...", "caption": "..." }
}
```

Telegram Business rejects fresh uploads (`BUSINESS_PEER_USAGE_MISSING`,
`src/lib/telegram/api.ts:117-126`), so media MUST be sent by `file_id` staged
through `TELEGRAM_STAGING_CHAT_ID`. A small admin screen uploads each asset once
and stores the resulting `file_id`.

Reuse `sendBusinessLocation` (`src/lib/inbox-send.ts:209`) and
`sendBusinessProofMedia` (`:101`) for video/photo.

**Gap:** document/PDF has no wrapper in `inbox-send.ts`; the logic is inlined in
`src/app/api/inbox/[id]/reply-document/route.ts:73`. Extract
`sendBusinessDocument({ conversationId, fileId, caption, userId })` so PRICELIST
works. This is the only genuinely new send capability required.

### 4.6 After the handoff

Once the media is sent, this is an ordinary Inbox conversation: the live AI agent
(AUTO mode) handles it and the owner sees it with the client already linked. **No
agent changes are required.**

## 5. Part B — Android app

Single-user, **sideloaded** (no Play Store, so restricted permissions are fine).

- **Overlay bubble** — `SYSTEM_ALERT_WINDOW`, a small always-on-top button.
- **Call detection** — `READ_PHONE_STATE`; on the transition to IDLE after OFFHOOK,
  surface the bubble with the number pre-filled. `READ_CALL_LOG` is the fallback
  for retrieving the last number.
- **Number capture** — from the call state, editable before sending.
- **Preset menu** — tap the bubble → four toggles → Send.
- **Network** — one HTTPS `POST /api/handoff` with the device token. On failure,
  retry with backoff and keep a local queue: a call often ends in poor signal.
- **SMS** — `SEND_SMS`, sent from the device SIM so it arrives from the owner's own
  number. The body is exactly the `smsText` the CRM returned.
- **Config screen** — CRM base URL + device token, entered once.

These permissions are intrusive by design. This is a private tool for one device
and must never be published.

## 6. Edge cases (all handled explicitly)

| Case | Behaviour |
|---|---|
| Customer never taps the link | Stays PENDING, expires after 7 days, visible in the CRM list |
| Customer edits the message but keeps the token | Word-boundary regex still matches |
| Customer deletes the token, writes their own text | No match. Appears as a normal unlinked chat; owner links it by hand via the existing `link-conversation` route |
| Number is not on Telegram | SMS delivered, nothing else happens, follow-up expires |
| Same number called twice | The newer PENDING follow-up supersedes; the older is CANCELED so one message cannot consume two |
| Token collision | Unique violation → regenerate, up to 5 attempts |
| Customer already has a conversation | Token still matches; client link and media send still run |
| Wrong number captured | Owner edits it in the bubble before sending |
| Device token leaked | Attacker can only create pending follow-ups. Rotate the env var; rate limiting caps abuse |

## 7. Non-goals

- No MTProto/user-account automation — it breaks Telegram's rules and risks the
  owner's number.
- No sending to customers who never message first — impossible, see §2.
- No multi-operator support in v1. The token is per-device, so adding operators
  later means issuing more device tokens, not a redesign.
- No Play Store distribution.

## 8. Verification

- **Part A:** unit tests for token generation (charset, collision retry) and token
  extraction (word boundary, case-insensitivity, false-positive resistance); an
  integration test for webhook matching including the double-call supersede case;
  `tsc` clean, full suite green, build compiles.
- **End-to-end rehearsal before any real customer:** create a follow-up via
  `POST /api/handoff`, message the business account with that token from a second
  Telegram account, and confirm the conversation links to the right Client and the
  media arrives.
- **Data safety:** this feature only ever CREATES rows (PendingFollowUp, Client
  upsert, Message). It must never modify existing orders, payments or clients
  beyond linking — per the constitutional rule in `CLAUDE.md`.
