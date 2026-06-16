# Payment Receipts — Design

**Date:** 2026-06-16
**Status:** Approved (design) — pending spec review

## 1. Summary

Operators receive bank/mobile-transfer payment receipts from customers (via Telegram/WhatsApp)
and today forward them to a Telegram group for the owner to confirm. This feature pulls receipts
into the CRM and attaches them to the order, so the owner reviews them right where they confirm
the payment.

Two capture paths:
- **In-CRM upload** — attach receipt image(s) while recording a payment (at placement or after),
  or onto an existing payment.
- **Bot-forward (the convenience path)** — an operator forwards the receipt to `etalontbm_bot`
  with the order number in the caption; the bot drops it onto that order automatically. Removes
  the save→switch-app→upload back-and-forth.

## 2. Goals / Non-goals

**Goals**
- Attach one or more receipt images to an order, optionally linked to a specific payment.
- Owner sees receipts in `ConfirmPaymentDialog` when confirming/rejecting.
- Bot path: forward a photo + order number → auto-attached to that order, with a reply confirming.
- Authorize the bot path so only known operators can attach receipts.

**Non-goals**
- No OCR / auto-reading the amount from the receipt (owner still reads it).
- No change to the payment confirm/maker-checker logic itself — receipts are evidence shown alongside.
- No WhatsApp bot path (the Baileys integration is parked; WhatsApp receipts use the in-CRM upload).
- Not closing the broader `/uploads` public-serving exposure (see §7) — out of scope, noted.

## 3. Decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Storage shape | Order-level **`Receipt`** table with an *optional* `paymentId` (a bot receipt arrives with only an order, no payment yet) |
| Capture points | In-CRM (placement + add-payment + attach-to-existing) **and** bot-forward |
| Operator ↔ Telegram link | **Owner enters each operator's Telegram user ID** in user management (`User.telegramUserId`) |
| Build order | **Phase 1** in-CRM receipts (foundation) → **Phase 2** bot-forward |
| `/uploads` security | Keep consistent with today's public-by-URL posture (same as delivery proofs / inbox media); broader gating deferred |

## 4. Data model

Additive (safe `prisma db push`).

```prisma
enum ReceiptSource { CRM_UPLOAD TELEGRAM_BOT }

model Receipt {
  id           String        @id @default(cuid())
  orderId      String
  order        Order         @relation(fields: [orderId], references: [id], onDelete: Cascade)
  // Optional link to a specific payment. Null = an order-level receipt not yet
  // tied to a payment row (the common case for a bot-forwarded receipt).
  paymentId    String?
  payment      Payment?      @relation(fields: [paymentId], references: [id], onDelete: SetNull)
  imageUrl     String        // /uploads/receipts/…
  source       ReceiptSource @default(CRM_UPLOAD)
  uploadedById String?       // CRM user who uploaded / the linked operator who forwarded
  uploadedBy   User?         @relation("ReceiptUploader", fields: [uploadedById], references: [id])
  createdAt    DateTime      @default(now())
  @@index([orderId])
  @@index([paymentId])
}
```

Plus `User.telegramUserId String? @unique` — the operator's numeric Telegram id (stored as a
string), set by the owner in user management. `@unique` so one Telegram account maps to one
operator. Back-relations: `Order.receipts Receipt[]`, `Payment.receipts Receipt[]`,
`User.uploadedReceipts Receipt[]`.

## 5. Phase 1 — In-CRM receipts (foundation)

**Upload endpoint** `POST /api/payments/upload-receipt` (multipart, gated `payment.record`) —
reuses the existing image pipeline (`saveBufferToUploads`, `ALLOWED_IMAGE_MIME`,
`MAX_IMAGE_SIZE_BYTES`, magic-byte sniff). Saves to `/uploads/receipts/<userId>/<uuid>.<ext>`
and returns `{ url }`. (Mirror `upload-drawing/route.ts`.)

**Capture points:**
1. **At placement** — `PlaceOrderDialog`'s up-front payment gains a "📎 Receipt" control
   (upload → collect URLs). The URLs ride in the place-order payload (`PlaceOrderSchema` +
   `create-order.ts`): when the up-front `Payment` is created, also create `Receipt` rows
   (`paymentId` + `orderId` set, `source: CRM_UPLOAD`, `uploadedById` = caller).
2. **After placement** — `AddPaymentDialog` ("+ Тўлов қўшиш") gains the same control; the URLs go
   in the `POST /api/payments` body → the route creates the `Payment` + linked `Receipt` rows.
3. **Attach to an existing payment** — a small "attach receipt" action on each payment row →
   `POST /api/payments/[id]/receipts` (multipart, `payment.record`) → creates a `Receipt` linked
   to that payment + its order.

**Owner review:** `ConfirmPaymentDialog` shows the receipt **thumbnails** for that payment AND any
unlinked order-level receipts; click → full-size via the existing inbox `ImageViewer`. The order
detail page also lists the order's receipts (so operators with `payment.view` see them).

**Validation/UX:** image-only, 8 MB cap, multiple allowed, busy/disabled states, graceful errors.

## 6. Phase 2 — Bot-forward

**Operator linking:** add `telegramUserId` to the user-edit form + `UpdateUserSchema`; the owner
pastes each operator's Telegram numeric id (operators read it from @userinfobot). Gated by the
existing `user.edit` / `user.editPermissions` rules.

**Webhook DM handler** (`src/app/api/telegram/webhook/route.ts`): today the webhook handles
`deleted_business_messages`, `callback_query`, and **business** messages (`parseBusinessUpdate`).
Add a branch for a **direct** `update.message` (an operator DMing the bot — not a business
message) that carries a **photo** + a **caption**:
1. Resolve the sender: `update.message.from.id` → find a `User` with matching `telegramUserId`
   that is active and has `payment.record`. If none → reply "Сиз боғланмагансиз · You're not
   linked / not authorized" and stop. (This is the authz gate — no mapping, no attach.)
2. Parse the **order number** from the caption (accept `№123`, `#123`, `123`, or `order 123`;
   a small pure `parseOrderRef(caption)` → number). No number → reply asking for the order number.
3. Find the `Order` by `orderNumber`. Not found → reply "Буюртма топилмади · Order not found".
4. Download the largest photo size (reuse `tgGetFilePath` + `tgDownloadFile`), validate it's an
   image, save to `/uploads/receipts/order-<orderId>/<uuid>.<ext>`, create a `Receipt`
   (`source: TELEGRAM_BOT`, `uploadedById` = the linked operator, `orderId`, `paymentId: null`).
5. Reply via the bot: "✅ №123 буюртмага чек қўшилди · receipt added to order №123".

Notes: direct DMs reply with the plain bot `sendMessage` (not the business send). The branch is
additive and runs before/independently of the business-message path. Idempotency: de-dupe on the
Telegram file unique id so a re-delivered update doesn't double-insert.

## 7. Security

- **Authz:** in-CRM upload gated `payment.record`; viewing receipts follows `payment.view`. Bot
  path is gated by the `telegramUserId` mapping + `payment.record` — an unknown Telegram user can
  attach nothing.
- **`/uploads` is public by URL** (no login check) — the same posture as delivery-proof photos,
  inbox media, and drawings today. Receipts hold financial info and inherit that known exposure.
  Gating `/uploads` behind auth is a broader, separate fix (deferred; flagged).
- Magic-byte image validation on every path (reject non-images / oversized).

## 8. Testing

- **Pure `parseOrderRef(caption)`** (Phase 2): `№123`/`#123`/`123`/`order 123` → 123; junk → null.
- **Receipt-row creation**: recording a payment with receipt URLs creates linked `Receipt` rows;
  attach-to-existing creates an order+payment-linked row. (Unit where a harness exists; otherwise
  the upload endpoint's body schema + the pure mapping.)
- **Upload endpoint**: rejects non-image / oversized; accepts a valid image and returns a URL.
- **Webhook DM branch**: unlinked sender → no attach + a reply; linked sender + valid order →
  Receipt created. (Exercised against the parse + resolve helpers; full webhook is integration.)
- Confirm view rendering of receipts is manual (no component-test harness), tsc + build gating.

## 9. Phasing

1. **Phase 1 — in-CRM receipts.** `Receipt` table + `User` field (db push) · upload endpoint ·
   payment-dialog + place-order + attach-to-existing wiring · confirm-dialog + order-detail display.
   Independently shippable; works without any Telegram setup.
2. **Phase 2 — bot-forward.** `telegramUserId` in user management · webhook DM branch +
   `parseOrderRef` + download/attach + reply.

Each phase is independently shippable.
