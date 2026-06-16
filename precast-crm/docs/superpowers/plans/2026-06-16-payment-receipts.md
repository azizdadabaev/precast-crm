# Payment Receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach payment-receipt images to orders — via in-CRM upload in the payment dialogs (Phase 1) and via forwarding to `etalontbm_bot` with the order number (Phase 2).

**Architecture:** An order-level `Receipt` row (image URL + source + uploader + optional `paymentId`) stores each receipt. Phase 1 reuses the existing image-upload pipeline and wires receipts into the record/place/confirm flows. Phase 2 adds an operator↔Telegram mapping (`User.telegramUserId`, owner-entered) and a webhook branch that turns a forwarded photo + `YYYY-MM-NNNN` caption into a `Receipt`.

**Tech Stack:** Next.js 14 App Router · Prisma/PostgreSQL · TypeScript · Zod · React Query · Telegram Bot API · vitest.

**Working dir for all commands:** `c:/Users/aziz/Downloads/precast-crm/precast-crm/precast-crm`. Commit messages: no `Co-Authored-By` line. Spec: `docs/superpowers/specs/2026-06-16-payment-receipts-design.md`.

---

## File Structure

| File | New/Modify | Responsibility |
|------|-----------|----------------|
| `prisma/schema.prisma` | Modify | `Receipt` model + `ReceiptSource` enum + `User.telegramUserId` + back-relations |
| `src/app/api/payments/upload-receipt/route.ts` | Create | Multipart receipt image upload → `{ url }` |
| `src/lib/validation.ts` | Modify | `receiptUrls` on `PaymentRecordSchema` + `PlaceOrderSchema`; `telegramUserId` on `UpdateUserSchema` |
| `src/app/api/payments/route.ts` | Modify | Create `Receipt` rows when recording a payment |
| `src/lib/create-order.ts` | Modify | Create `Receipt` rows for the up-front payment at placement |
| `src/app/api/payments/[id]/receipts/route.ts` | Create | Attach a receipt to an existing payment |
| `src/components/payments/AddPaymentDialog.tsx` | Modify | Receipt attach control |
| `src/components/calculation/PlaceOrderDialog.tsx` | Modify | Receipt attach control on up-front payment |
| `src/components/payments/ReceiptStrip.tsx` | Create | Reusable thumbnails + ImageViewer (used by confirm dialog + order detail) |
| `src/components/payments/ConfirmPaymentDialog.tsx` | Modify | Show receipts |
| `src/app/(app)/orders/[id]/page.tsx` | Modify | Include receipts in the order query; show them; "attach receipt" action |
| `src/lib/order-receipt-ref.ts` | Create | Pure `parseOrderRef(caption)` (Phase 2) |
| `src/app/api/telegram/webhook/route.ts` | Modify | Operator-DM branch → create `Receipt` (Phase 2) |
| `src/app/(app)/users/...` (edit form) | Modify | `telegramUserId` input (Phase 2) |
| `tests/order-receipt-ref.test.ts`, `tests/payment-receipt-schema.test.ts` | Create | Unit tests |

---

# PHASE 1 — In-CRM receipts

## Task 1: Schema — Receipt model + User.telegramUserId

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1:** Add the enum near the other enums:

```prisma
enum ReceiptSource {
  CRM_UPLOAD
  TELEGRAM_BOT
}
```

- [ ] **Step 2:** Add the model near `Payment`:

```prisma
model Receipt {
  id           String        @id @default(cuid())
  orderId      String
  order        Order         @relation(fields: [orderId], references: [id], onDelete: Cascade)
  // Optional link to a specific payment. Null = order-level (e.g. bot-forwarded
  // before a payment row exists).
  paymentId    String?
  payment      Payment?      @relation(fields: [paymentId], references: [id], onDelete: SetNull)
  imageUrl     String
  source       ReceiptSource @default(CRM_UPLOAD)
  uploadedById String?
  uploadedBy   User?         @relation("ReceiptUploader", fields: [uploadedById], references: [id])
  createdAt    DateTime      @default(now())

  @@index([orderId])
  @@index([paymentId])
  @@map("receipts")
}
```

- [ ] **Step 3:** Add back-relations + the user field:
  - In `model Order { … }` add: `receipts Receipt[]`
  - In `model Payment { … }` add: `receipts Receipt[]`
  - In `model User { … }` add: `telegramUserId String? @unique` and `uploadedReceipts Receipt[] @relation("ReceiptUploader")`

- [ ] **Step 4:** Run `npx prisma generate` (paste the success line). Do NOT run `db push` (done at deploy). Run `npx tsc --noEmit` → clean. Run `npx vitest run` → green.

- [ ] **Step 5:** Commit:
```bash
git add prisma/schema.prisma
git commit -m "Feat(payments) · Receipt model + User.telegramUserId"
```

---

## Task 2: Receipt upload endpoint

**Files:** Create `src/app/api/payments/upload-receipt/route.ts`

Mirror `src/app/api/calculations/upload-drawing/route.ts` exactly, but gate on `payment.record` and save under `receipts/<userId>`.

- [ ] **Step 1:** Create the route:

```ts
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { ALLOWED_IMAGE_MIME, MAX_IMAGE_SIZE_BYTES, imageExtFromBytes, saveBufferToUploads } from "@/lib/uploads";

/** POST /api/payments/upload-receipt — payment.record. Store a receipt image the
 *  operator picked; returns { url } to attach to a payment. Multipart: file. */
export const POST = withPermission("payment.record", async (req: NextRequest, { user }) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return fail("Файл юборилмади · No file provided", 422);
  }
  const f = file as File;
  if (!ALLOWED_IMAGE_MIME.has((f.type || "").toLowerCase())) {
    return fail("Фақат расм қабул қилинади · Only JPG, PNG, or WEBP images are accepted", 422);
  }
  if (f.size === 0) return fail("Бўш файл · Empty file", 422);
  if (f.size > MAX_IMAGE_SIZE_BYTES) return fail("Расм катта (макс 8 МБ) · Image too large (max 8 MB)", 413);
  const buffer = Buffer.from(await f.arrayBuffer());
  const ext = imageExtFromBytes(buffer);
  if (!ext) return fail("Расм нотўғри · Not a valid image", 422);
  const url = await saveBufferToUploads(buffer, `receipts/${user.id}`, `${randomUUID()}.${ext}`);
  return ok({ url });
});
```

- [ ] **Step 2:** `npx tsc --noEmit` → clean. `npx next build` → succeeds.
- [ ] **Step 3:** Commit:
```bash
git add src/app/api/payments/upload-receipt/route.ts
git commit -m "Feat(payments) · receipt image upload endpoint (payment.record)"
```

---

## Task 3: Store receipts when recording / placing a payment

**Files:** Modify `src/lib/validation.ts`, `src/app/api/payments/route.ts`, `src/lib/create-order.ts`; Test `tests/payment-receipt-schema.test.ts`

- [ ] **Step 1 (failing test):** Create `tests/payment-receipt-schema.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PaymentRecordSchema } from "@/lib/validation";

describe("PaymentRecordSchema receiptUrls", () => {
  it("accepts receiptUrls", () => {
    const r = PaymentRecordSchema.safeParse({ orderId: "o1", amount: 100, method: "BANK_TRANSFER", receiptUrls: ["/uploads/receipts/u1/a.jpg"] });
    expect(r.success).toBe(true);
  });
  it("defaults receiptUrls to []", () => {
    const r = PaymentRecordSchema.parse({ orderId: "o1", amount: 100, method: "CASH" });
    expect(r.receiptUrls).toEqual([]);
  });
  it("rejects more than 10 receipts", () => {
    const many = Array.from({ length: 11 }, (_, i) => `/uploads/receipts/u1/${i}.jpg`);
    expect(PaymentRecordSchema.safeParse({ orderId: "o1", amount: 100, method: "CASH", receiptUrls: many }).success).toBe(false);
  });
});
```
Run `npx vitest run tests/payment-receipt-schema.test.ts` → FAIL.

- [ ] **Step 2:** In `src/lib/validation.ts`, add to `PaymentRecordSchema` (and to `PlaceOrderSchema`) this field:
```ts
  receiptUrls: z.array(z.string().max(500)).max(10).default([]),
```

- [ ] **Step 3:** Run the test → PASS.

- [ ] **Step 4:** In `src/app/api/payments/route.ts`, inside the `prisma.$transaction` after `tx.payment.create({...})` returns `p` (and before `return p`), create the receipt rows:
```ts
    if (body.receiptUrls.length) {
      await tx.receipt.createMany({
        data: body.receiptUrls.map((url) => ({
          orderId: body.orderId,
          paymentId: p.id,
          imageUrl: url,
          source: "CRM_UPLOAD" as const,
          uploadedById: user.id,
        })),
      });
    }
```

- [ ] **Step 5:** In `src/lib/create-order.ts`, find where the up-front `Payment` is created (the `paidAmount`/`paymentMethod` branch that makes a Payment row). After that payment is created, if `input.receiptUrls?.length`, create `Receipt` rows with `paymentId` = the new payment id, `orderId` = the new order id, `source: "CRM_UPLOAD"`, `uploadedById` = the acting user. Thread `receiptUrls` through the `CreateOrderInput` type and from the `POST /api/orders` handler (which parses `PlaceOrderSchema`). If the order is placed with `paidAmount === 0` (no payment row), ignore receiptUrls.

- [ ] **Step 6:** `npx tsc --noEmit` → clean. `npx vitest run` → green. `npx next build` → succeeds.

- [ ] **Step 7:** Commit:
```bash
git add src/lib/validation.ts src/app/api/payments/route.ts src/lib/create-order.ts tests/payment-receipt-schema.test.ts
git commit -m "Feat(payments) · persist receipts when recording or placing a payment"
```

---

## Task 4: Attach a receipt to an existing payment

**Files:** Create `src/app/api/payments/[id]/receipts/route.ts`

- [ ] **Step 1:** Create the route (multipart; mirrors the upload endpoint but also creates the `Receipt` row linked to the payment):

```ts
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { ALLOWED_IMAGE_MIME, MAX_IMAGE_SIZE_BYTES, imageExtFromBytes, saveBufferToUploads } from "@/lib/uploads";

/** POST /api/payments/[id]/receipts — payment.record. Attach a receipt image to an
 *  existing payment (e.g. one recorded earlier without a receipt). Multipart: file. */
export const POST = withPermission<{ id: string }>("payment.record", async (req: NextRequest, { user, params }) => {
  const payment = await prisma.payment.findUnique({ where: { id: params.id }, select: { id: true, orderId: true } });
  if (!payment) return fail("Payment not found", 404);

  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) return fail("No file provided", 422);
  const f = file as File;
  if (!ALLOWED_IMAGE_MIME.has((f.type || "").toLowerCase())) return fail("Only JPG, PNG, or WEBP images are accepted", 422);
  if (f.size === 0) return fail("Empty file", 422);
  if (f.size > MAX_IMAGE_SIZE_BYTES) return fail("Image too large (max 8 MB)", 413);
  const buffer = Buffer.from(await f.arrayBuffer());
  const ext = imageExtFromBytes(buffer);
  if (!ext) return fail("Not a valid image", 422);

  const url = await saveBufferToUploads(buffer, `receipts/${user.id}`, `${randomUUID()}.${ext}`);
  const receipt = await prisma.receipt.create({
    data: { orderId: payment.orderId, paymentId: payment.id, imageUrl: url, source: "CRM_UPLOAD", uploadedById: user.id },
    select: { id: true, imageUrl: true },
  });
  return ok(receipt);
});
```

- [ ] **Step 2:** `npx tsc --noEmit` → clean. `npx next build` → succeeds.
- [ ] **Step 3:** Commit:
```bash
git add "src/app/api/payments/[id]/receipts/route.ts"
git commit -m "Feat(payments) · attach a receipt to an existing payment"
```

---

## Task 5: UI — attach control + receipt display

**Files:** Create `src/components/payments/ReceiptStrip.tsx`; Modify `AddPaymentDialog.tsx`, `PlaceOrderDialog.tsx`, `ConfirmPaymentDialog.tsx`, `src/app/(app)/orders/[id]/page.tsx`. No unit test (no component harness) — verify with tsc + build + manual.

- [ ] **Step 1 — `ReceiptStrip.tsx`:** a presentational component `({ urls }: { urls: string[] })` that renders thumbnail `<img>`s (~64px, rounded) wrapped in the inbox `ImageViewerProvider` so clicking opens full-size. Read `src/components/inbox/ImageViewer.tsx` + `MediaRenderers.tsx` to reuse `ImageViewerProvider` / `useImageViewer` exactly as `DrawingDock` does. Render nothing when `urls` is empty.

- [ ] **Step 2 — receipt picker in the dialogs:** In `AddPaymentDialog.tsx` and `PlaceOrderDialog.tsx`, add a "📎 Чек · Receipt" file input (`accept="image/*" multiple`). On select, POST each file to `/api/payments/upload-receipt` (raw `fetch` with FormData, like `handleDroppedFiles` in `calculations/page.tsx`), collect the returned `url`s into local state, show them via `ReceiptStrip` with a remove (✕) per thumbnail. Include the collected `receiptUrls` in the submit payload (AddPaymentDialog → the `POST /api/payments` body; PlaceOrderDialog → the `onConfirm`/place-order payload). Show busy/error states. Gate the picker behind `payment.record` (the `["me"]` permissions query, same pattern as `AiAssistBox`).

- [ ] **Step 3 — order query includes receipts:** In `orders/[id]/page.tsx`, add `receipts: { id, imageUrl, paymentId, source, createdAt }` to the order TS type and confirm the GET `/api/orders/[id]` returns them (Prisma `include`; add `receipts: true` to the order include in that route if a restrictive include omits them).

- [ ] **Step 4 — display + attach-to-existing:** On the order detail, render each payment row's receipts with `ReceiptStrip` (filter `receipts` by `paymentId`), plus any order-level receipts (`paymentId === null`) in a small "Чеклар · Receipts" area. On each payment row add a "+ чек" button (for `payment.record` holders) that uploads via `POST /api/payments/[id]/receipts` then invalidates the order query.

- [ ] **Step 5 — confirm dialog:** In `ConfirmPaymentDialog.tsx`, render `ReceiptStrip` for the payment being confirmed (the receipts linked to it + unlinked order-level ones), so the owner reviews the receipt before confirming. The dialog already receives the payment + order context; pass the receipts in.

- [ ] **Step 6:** `npx tsc --noEmit` → clean. `npx next build` → succeeds. `npx vitest run` → green.

- [ ] **Step 7:** Commit:
```bash
git add src/components/payments/ReceiptStrip.tsx src/components/payments/AddPaymentDialog.tsx src/components/calculation/PlaceOrderDialog.tsx src/components/payments/ConfirmPaymentDialog.tsx "src/app/(app)/orders/[id]/page.tsx"
git commit -m "Feat(payments) · receipt picker in dialogs + thumbnails on order + confirm view"
```

(If the GET order route needed an include change, add that file to the commit.)

---

## Task 6: Phase 1 verification

- [ ] Run `npx vitest run` (all green), `npx tsc --noEmit` (clean), `npx next build` (succeeds; `/api/payments/upload-receipt` + `/api/payments/[id]/receipts` appear).
- [ ] Manual: record a bank-transfer payment with a receipt → it shows on the order; the owner sees it in the confirm dialog; attach-to-existing works. (Map tile / image serves from `/uploads`.)

---

# PHASE 2 — Bot-forward

## Task 7: `parseOrderRef` pure helper

**Files:** Create `src/lib/order-receipt-ref.ts`; Test `tests/order-receipt-ref.test.ts`

- [ ] **Step 1 (failing test):** Create `tests/order-receipt-ref.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseOrderRef } from "@/lib/order-receipt-ref";

describe("parseOrderRef", () => {
  it("extracts a YYYY-MM-NNNN order number from a caption", () => {
    expect(parseOrderRef("чек 2026-06-0010")).toBe("2026-06-0010");
    expect(parseOrderRef("№2026-06-0010")).toBe("2026-06-0010");
    expect(parseOrderRef("2026-06-0010 to'lov")).toBe("2026-06-0010");
  });
  it("returns null for junk, a bare number, or a bad month", () => {
    expect(parseOrderRef("hello")).toBeNull();
    expect(parseOrderRef("123")).toBeNull();
    expect(parseOrderRef("2026-13-0001")).toBeNull(); // month 13 invalid
    expect(parseOrderRef("")).toBeNull();
  });
});
```
Run `npx vitest run tests/order-receipt-ref.test.ts` → FAIL.

- [ ] **Step 2:** Create `src/lib/order-receipt-ref.ts`:

```ts
import { parseOrderNumber } from "./order-number";

/** Extract a canonical order number (YYYY-MM-NNNN) from a free-text bot caption.
 *  Returns the order-number string (validated via parseOrderNumber), or null. */
export function parseOrderRef(caption: string | null | undefined): string | null {
  if (!caption) return null;
  const m = caption.match(/\d{4}-\d{2}-\d{4}/);
  if (!m) return null;
  return parseOrderNumber(m[0]) ? m[0] : null;
}
```

- [ ] **Step 3:** Run the test → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 4:** Commit:
```bash
git add src/lib/order-receipt-ref.ts tests/order-receipt-ref.test.ts
git commit -m "Feat(payments) · parseOrderRef — pull YYYY-MM-NNNN from a bot caption"
```

---

## Task 8: `telegramUserId` in user management

**Files:** Modify `src/lib/validation.ts` (`UpdateUserSchema`) + the user-edit UI under `src/app/(app)/users/`.

- [ ] **Step 1:** Add to `UpdateUserSchema`:
```ts
  // Telegram numeric user id for the receipt-forward bot. Owner-entered. Empty
  // string clears it. Digits only.
  telegramUserId: z.string().regex(/^\d{5,15}$/).or(z.literal("")).optional(),
```

- [ ] **Step 2:** In the PUT/PATCH user route (`src/app/api/users/[id]/route.ts`), when `telegramUserId` is provided, set `data.telegramUserId = body.telegramUserId === "" ? null : body.telegramUserId`. (Gate stays on the existing `user.edit` / `user.editPermissions` check.) Map a Prisma unique-violation (P2002) to a clean 409 "Telegram ID already linked to another user".

- [ ] **Step 3:** In the user-edit form/page, add a "Telegram ID" text input bound to `telegramUserId` with helper text "Operator gets it from @userinfobot". Read the existing form first and follow its field pattern.

- [ ] **Step 4:** `npx tsc --noEmit` → clean. `npx vitest run` → green. `npx next build` → succeeds.

- [ ] **Step 5:** Commit:
```bash
git add src/lib/validation.ts "src/app/api/users/[id]/route.ts" src/app/\(app\)/users
git commit -m "Feat(users) · owner-entered telegramUserId for the receipt bot"
```

---

## Task 9: Webhook operator-DM branch → create Receipt

**Files:** Modify `src/app/api/telegram/webhook/route.ts`

Add a branch BEFORE `const parsed = update ? parseBusinessUpdate(update) : null;` that handles a **direct** message to the bot (`update.message`, NOT `business_message`) carrying a photo. Direct DMs appear as `update.message` with `message.from.id`, `message.photo` (array of sizes — last is largest), `message.caption`, `message.chat.id`.

- [ ] **Step 1:** Implement the branch:

```ts
  // Operator forwards a payment receipt directly to the bot (a plain DM, not a
  // business message). Authorize by telegramUserId mapping; attach to the order
  // named in the caption (YYYY-MM-NNNN). Replies to the operator either way.
  const dm = update?.message;
  if (dm?.chat?.id != null && Array.isArray(dm.photo) && dm.photo.length > 0 && !update.business_connection_id) {
    void handleOperatorReceiptDm(dm).catch((err) => console.error("[telegram receipt dm]", err));
    return new Response("ok");
  }
```

Then add `handleOperatorReceiptDm` (in this file or a sibling `src/lib/agent/receipt-dm.ts` — prefer a sibling for testability) that:
1. `const fromId = String(dm.from?.id ?? "")` → `const operator = await prisma.user.findFirst({ where: { telegramUserId: fromId, isActive: true } })`. If none, or `!can(operator, "payment.record")` → `tgSendMessage(String(dm.chat.id), "⚠️ Сиз боғланмагансиз ёки рухсат йўқ · You're not linked / not authorized")` and return. (`can` from `@/lib/permissions`.)
2. `const ref = parseOrderRef(dm.caption)`. If null → reply "⚠️ Буюртма рақамини ёзинг (масалан 2026-06-0010) · Add the order number (e.g. 2026-06-0010)" and return.
3. `const order = await prisma.order.findFirst({ where: { orderNumber: ref }, select: { id: true, orderNumber: true } })`. If null → reply "⚠️ Буюртма топилмади: {ref} · Order not found" and return.
4. Idempotency: the largest photo's `file_unique_id` (`dm.photo[dm.photo.length-1].file_unique_id`). Skip if a `Receipt` for this order already has it — store it as a suffix in the filename or add a `tgFileUniqueId` column; simplest: name the file `${file_unique_id}.${ext}` and `findFirst` a receipt whose `imageUrl` ends with it before inserting.
5. Download: `const filePath = await tgGetFilePath(largest.file_id); const buf = await tgDownloadFile(filePath);` validate `looksLikeImage(buf)`; `const ext = imageExtFromBytes(buf)`; `const url = await saveBufferToUploads(buf, \`receipts/order-${order.id}\`, \`${file_unique_id}.${ext}\`);`
6. `await prisma.receipt.create({ data: { orderId: order.id, paymentId: null, imageUrl: url, source: "TELEGRAM_BOT", uploadedById: operator.id } })`.
7. Reply: `tgSendMessage(String(dm.chat.id), \`✅ №${order.orderNumber} буюртмага чек қўшилди · receipt added\`)`.

Use the basic text-send helper in `src/lib/telegram/api.ts` (the function wrapping `sendMessage` near the top — confirm its exported name and signature `(chatId, text)`); `tgGetFilePath`, `tgDownloadFile` are at lines ~350/362; `parseOrderRef` from Task 7; `looksLikeImage`/`imageExtFromBytes`/`saveBufferToUploads` from `@/lib/uploads`.

- [ ] **Step 2:** `npx tsc --noEmit` → clean. `npx vitest run` → green (parseOrderRef tests cover the parse; the webhook branch itself is integration — verified manually). `npx next build` → succeeds.

- [ ] **Step 3:** Commit:
```bash
git add "src/app/api/telegram/webhook/route.ts" src/lib/agent/receipt-dm.ts
git commit -m "Feat(payments) · bot-forward — operator DM photo + order number → Receipt"
```

---

## Task 10: Final verification

- [ ] `npx vitest run` (green), `npx tsc --noEmit` (clean), `npx next build` (succeeds).
- [ ] Manual Phase 2: owner sets an operator's `telegramUserId`; operator DMs the bot a photo with caption `2026-06-0010`; bot replies "✅ … added"; the receipt appears on order 2026-06-0010 and in its confirm dialog. Unlinked sender → "not linked" reply, nothing attached. Bad/missing order number → the corresponding reply.
- [ ] Dispatch a final code reviewer over the whole feature diff.

---

## Self-Review (completed during authoring)

**Spec coverage:** Receipt table + optional paymentId → T1 ✓ · in-CRM upload (placement/add/attach-existing) → T2/T3/T4 ✓ · confirm-view + order display → T5 ✓ · owner-entered telegramUserId → T8 ✓ · bot-forward with YYYY-MM-NNNN parsing (reusing parseOrderNumber) → T7/T9 ✓ · authz (payment.record + telegram mapping) → T2/T4/T9 ✓ · `/uploads` posture unchanged (noted, not gated) ✓.

**Placeholder scan:** Novel/testable code (schema, upload endpoint, receipt-creation snippet, parseOrderRef, webhook branch) is given in full. UI wiring (T5) references concrete existing patterns (`DrawingDock`/`ImageViewer`, `handleDroppedFiles`, `AiAssistBox` permission gate) rather than restating them — acceptable, as those are the canonical examples to copy; no `TBD`.

**Type consistency:** `Receipt`/`ReceiptSource`/`receiptUrls`/`telegramUserId`/`parseOrderRef`/`ReceiptStrip` names are consistent across tasks. `source` values `"CRM_UPLOAD"`/`"TELEGRAM_BOT"` match the enum.

**Note:** T5 and T9's UI/webhook portions lack unit tests (no component-test harness; webhook is integration) — covered by tsc + build + the manual scripts in T6/T10, with the pure pieces (schemas, `parseOrderRef`) carrying the automated coverage.
