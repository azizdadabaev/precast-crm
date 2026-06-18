# Telegram bot — truck photos via buttons (and forwarded-photo fix)

**Date:** 2026-06-18
**Status:** Approved (design) — proceeding to implementation

## 1. Problem

Two things, one root cause.

1. **Forwarded receipt photos loop forever.** The deployed bot reads the order number
   only from a photo's **caption** (`handleOperatorReceiptDm` → `parseOrderRef(dm.caption)`).
   A Telegram **forward strips the caption**, so the bot replies "Add the order number" —
   but there is no handler that accepts the number typed as a follow-up text. The operator's
   `06-0020` reply is never associated with the stashed photo, so it re-asks indefinitely.

2. **No truck-photo channel.** Loading workers want to send a loaded-truck photo to the bot
   and have it land in the order's **Loaded-truck** section, exactly like receipts land in
   Receipts. The bot currently treats every DM'd photo as a Receipt and can't tell the two
   apart (a photo is just pixels).

Both need the same missing machinery: a stateful per-sender session that holds the photo(s)
until the bot knows (a) the **order number** and (b) the **kind** (receipt vs truck).

## 2. Decisions (from the dialogue)

| Decision | Choice |
|----------|--------|
| Differentiate receipt vs truck | **Inline buttons** 🧾 Чек · Receipt / 🚚 Юк машина · Truck |
| When to show buttons | **Always, every photo, every sender** (uniform; +1 tap on receipts is accepted) |
| Order-number entry | Caption if present, else **typed follow-up reply** (fixes the forward loop) |
| Truck status guard | Attach only when order is **LOADED / DISPATCHED / DELIVERED** (`canAddLoadedPhoto`) |
| Receipt authz | `payment.record` (unchanged) |
| Truck authz | `order.edit` (same gate as the in-CRM "+ Add photo") |
| Bot entry authz | Telegram-linked (`telegramUserId`) + active + has at least one of the two perms |

## 3. Flow

**Self-taken photo with caption** `06-0020`:
photo → authorize → resolve order → reply with [🧾 Receipt][🚚 Truck] → tap → attach.

**Forwarded photo (no caption):**
photo → authorize → stash, reply "send the order number" → operator types `06-0020`
→ resolve order → reply with [🧾 Receipt][🚚 Truck] → tap → attach.

**Album (several photos):** accumulate into one session; one button prompt; one tap files
the whole batch.

**On tap:**
- Re-authorize the tapper for the chosen kind (`payment.record` / `order.edit`).
- **Receipt** → create `Receipt(source: TELEGRAM_BOT, paymentId: null)`.
- **Truck** → require `canAddLoadedPhoto(order.status)`; else "order isn't loaded yet".
  Download → magic-byte validate → save to `uploads/orders/<id>/` → create
  `GalleryPhoto(kind: LOADED, uploadedById)`. (Same shape the in-CRM endpoint writes, so the
  order page's existing thumbnail strip + delete button manage these too.)
- Per-photo idempotency by `file_unique_id` (Telegram redelivery / re-tap). Edit the button
  message to a result line and answer the callback toast.

## 4. Components

- `src/lib/agent/operator-photo-callback.ts` — encode/parse `op:<token>:<r|t>` callback_data
  (mirrors `approval-callback.ts`; 64-byte guard). **Pure / unit-tested.**
- `src/lib/agent/operator-photo-session.ts` — in-memory session store: per-sender stash of
  `{ token, fromId, chatId, photos[], order|null, createdAt }`; lookups by `fromId` (text
  reply) and `token` (callback); accumulate for albums; lazy TTL expiry (~15 min).
  **Pure / unit-tested.**
- `src/lib/agent/operator-photo-dm.ts` — handlers:
  - `handleOperatorPhotoDm(dm)` — a photo DM (stash + caption→buttons or ask-number).
  - `handleOperatorPhotoNumber(dm): Promise<boolean>` — a text DM that is the order number for
    a pending session (fast in-memory guard; returns false to fall through otherwise).
  - `handleOperatorPhotoCallback(cbq)` — a button tap (authz per kind, status guard, attach).
  Never throws (webhook is fire-and-forget + always 200).
- `src/app/api/telegram/webhook/route.ts` — route plain-DM photos → `handleOperatorPhotoDm`;
  plain-DM text with a pending session → `handleOperatorPhotoNumber`; `callback_query` whose
  data is an `op:` callback → `handleOperatorPhotoCallback`, else the existing approval handler.
- **Remove** `src/lib/agent/receipt-dm.ts` (its attach logic moves into `operator-photo-dm.ts`).

The half-built local receipt-stash work (`pending-receipts.ts`, uncommitted edits to
`receipt-dm.ts`/webhook) is **superseded** by this and set aside via `git stash` (recoverable).

## 5. Non-goals
- No server-side image processing; bot downloads the Telegram-sized JPEG and stores it.
- No change to the in-CRM upload UI or the LOADED↔status flow.
- No persistence of sessions across a server restart (in-memory, like the agent's other
  transient state) — a dropped session just means the operator re-sends; acceptable.

## 6. Testing
- **Unit:** callback encode/parse round-trip + reject malformed/oversized; session store
  accumulate / fromId+token lookup / take / expiry.
- **Handler:** unauthorized sender rejected; captioned photo → buttons (no immediate attach);
  text number resolves order → buttons; callback attaches receipt vs truck by kind; truck
  callback on a not-yet-loaded order is refused; idempotent re-tap.
- **Manual on prod:** forward a truck photo → send `06-0020` → tap 🚚 → appears in the order's
  Loaded-truck strip; forward a receipt → tap 🧾 → appears in Receipts.
