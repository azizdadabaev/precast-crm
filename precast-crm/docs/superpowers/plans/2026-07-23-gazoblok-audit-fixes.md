# Gazoblok Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the ~45 verified findings from `docs/superpowers/2026-07-21-gazoblok-audit.md` — money controls, concurrency races, silent UI failures, state-machine gaps, authorization, and design-system drift in the Gazoblok tab.

**Architecture:** Backend first (payment domain unification, compare-and-set concurrency guards, validation hardening), then frontend honesty (error states, cache invalidation, input protection), then the shipments layer and polish. No new dependencies, no new frameworks. Gazoblok money stays inside the gazoblok tab (owner decision) — pending confirmations become visible on the gazoblok orders list instead of joining the core queue.

**Tech Stack:** Next.js 14 App Router, Prisma + PostgreSQL, Tailwind + shadcn/ui, React Query, Zod, Vitest 2.x.

## Global Constraints

- **NO `git push`, NO deploy, NO prod SSH.** All commits stay local. The owner tests on localhost and explicitly confirms before any deploy.
- **Owner decisions (2026-07-23, binding):**
  - An order can be set DELIVERED **only when remaining balance is 0** and **no shipment is PENDING/LOADED** (core parity).
  - Catalog/config **mutations** require the existing `pricing.edit` permission. Reads stay open to all logged-in users.
  - Gazoblok money does **NOT** join the dashboard or `/payments` queue. Pending payments must be visible inside the gazoblok tab.
- All user-facing strings bilingual via `useT()`: `t("Ўзбекча матн", "English text")`. Server error strings use the existing `"Ўзбекча · English"` format.
- No new float money math. Use existing `round2`/`round3` from `@/services/calculation-engine`; comparisons on money use a `0.005` epsilon or integer values.
- Colors only via existing `Chip` variants / theme tokens — never raw palette classes like `bg-amber-50`.
- Test command: `npx vitest run <file>`. Full check: `npm run build` must pass with zero type errors.
- There is no component-test infra (no testing-library). UI tasks verify via `npx tsc --noEmit`-equivalent (`npm run build`) + a manual localhost checklist in the final task.
- Match existing commit style: `Fix(gazoblok) · <imperative summary>`.
- The canonical error/empty-state pattern to copy is `src/app/(app)/gazoblok/stock/page.tsx:101-104` (the one page that does it right).

## Out of scope (recorded, not implemented here)

- Public `/uploads` auth-gating (tracked B2 infra gap — Caddy/route change, separate effort).
- Codebase-wide integer-minor-units money refactor (audit I5 — systemic, shared with floor engine).
- Mobile card-layout redesign of the catalog table (audit 6.12, second half) — follow-up.

---

### Task 1: Payment domain unification (ceiling, shared state fn, auto-confirm, dropped-payment refine)

**Files:**
- Modify: `src/lib/gazoblok-validation.ts:45-58` (PlaceGazoblokOrderSchema refine), `:68-74` (record_payment receiptUrls prefix)
- Modify: `src/app/api/gazoblok/orders/[id]/route.ts:16-22` (delete local `recomputePaymentState`), `:119-161` (record_payment), `:163-223` (confirm_payment)
- Modify: `src/app/api/gazoblok/orders/route.ts:167-177` (placement-time payment auto-confirm)
- Test: `src/lib/gazoblok-validation.test.ts` (create)

**Interfaces:**
- Consumes: `paymentStateFor(confirmedPaid, writeOffAmount, totalPrice)` and `remainingBalance(totalPrice, confirmedPaid, writeOffAmount, pending)` from `src/lib/payment-state.ts` (already exist — pass `writeOffAmount = 0`; GazoblokOrder has no write-off column).
- Consumes: `can(user, "payment.confirm")` from `@/lib/permissions`.
- Produces: record_payment rejects amount > remaining and CANCELED orders; payments by `payment.confirm` holders land CONFIRMED in one step.

- [ ] **Step 1: Write failing schema tests** in `src/lib/gazoblok-validation.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PlaceGazoblokOrderSchema, GazoblokOrderActionSchema } from "./gazoblok-validation";

const baseOrder = {
  clientName: "Тест",
  clientPhone: "+998901234567",
  lines: [{ productId: "p1", quantity: 10 }],
};

describe("PlaceGazoblokOrderSchema payment coupling", () => {
  it("rejects paidAmount > 0 without paymentMethod", () => {
    const r = PlaceGazoblokOrderSchema.safeParse({ ...baseOrder, paidAmount: 5_000_000 });
    expect(r.success).toBe(false);
  });
  it("accepts paidAmount > 0 with paymentMethod", () => {
    const r = PlaceGazoblokOrderSchema.safeParse({
      ...baseOrder, paidAmount: 5_000_000, paymentMethod: "CASH",
    });
    expect(r.success).toBe(true);
  });
  it("accepts paidAmount 0 without method", () => {
    expect(PlaceGazoblokOrderSchema.safeParse(baseOrder).success).toBe(true);
  });
});

describe("record_payment receiptUrls prefix", () => {
  const rec = (urls: string[]) =>
    GazoblokOrderActionSchema.safeParse({
      action: "record_payment", amount: 100_000, method: "CASH", receiptUrls: urls,
    });
  it("accepts urls minted by the gazoblok uploader", () => {
    expect(rec(["/uploads/receipts/gazoblok/u1/abc.jpg"]).success).toBe(true);
  });
  it("rejects external urls", () => {
    expect(rec(["https://attacker.example/pixel.png"]).success).toBe(false);
  });
  it("rejects other modules' upload paths", () => {
    expect(rec(["/uploads/inbox/conv1/img.jpg"]).success).toBe(false);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/gazoblok-validation.test.ts` — expect FAIL (refine/prefix not implemented).

- [ ] **Step 3: Implement schema changes** in `src/lib/gazoblok-validation.ts`:

```ts
// After the existing PlaceGazoblokOrderSchema object, chain:
export const PlaceGazoblokOrderSchema = z.object({
  /* ...existing fields unchanged... */
}).refine((b) => b.paidAmount === 0 || !!b.paymentMethod, {
  message: "Тўлов усулини танланг · Payment method is required when an amount is paid",
  path: ["paymentMethod"],
});

// Receipt URLs must point at files the gazoblok uploader actually mints
// (see /api/gazoblok/upload-receipt → saveBufferToUploads('receipts/gazoblok/<userId>')).
const GazoblokUploadUrl = z.string().refine(
  (u) => u.startsWith("/uploads/receipts/gazoblok/"),
  { message: "Нотўғри файл манзили · Invalid receipt URL" },
);
// in record_payment variant: receiptUrls: z.array(GazoblokUploadUrl).max(20).default([])
// in set_status variant: deliveryProofUrl must satisfy
//   u.startsWith("/uploads/receipts/gazoblok/") || u.startsWith("/uploads/gazoblok/")
// (delivery proofs may also be shipment photos saved under /uploads/gazoblok/orders/<id>/).
```

- [ ] **Step 4:** `npx vitest run src/lib/gazoblok-validation.test.ts` — expect PASS.

- [ ] **Step 5: Route changes** in `src/app/api/gazoblok/orders/[id]/route.ts`:

Delete the local `recomputePaymentState` (lines 16-22) and the `PaymentState` type (line 16). Import instead:

```ts
import { paymentStateFor, remainingBalance } from "@/lib/payment-state";
```

In **record_payment** (before the `$transaction`), add the ceiling and CANCELED guard:

```ts
if (body.action === "record_payment") {
  if (order.status === "CANCELED") {
    return fail("Бекор қилинган буюртмага тўлов ёзиб бўлмайди · Cannot record payment on a canceled order", 422);
  }
  const pendingAgg = await prisma.gazoblokPayment.aggregate({
    where: { orderId: order.id, status: "PENDING_CONFIRMATION" },
    _sum: { amount: true },
  });
  const pendingSum = Number(pendingAgg._sum.amount ?? 0);
  const remaining = remainingBalance(
    Number(order.totalPrice), Number(order.confirmedPaid), 0, pendingSum,
  );
  if (body.amount > remaining + 0.005) {
    return fail(
      `Сумма қолдиқдан ошиб кетди (қолдиқ ${remaining}) · Amount exceeds remaining balance (${remaining})`,
      422,
    );
  }
  const autoConfirm = can(user, "payment.confirm");
  const now = new Date();
  // ...existing transaction, with:
  //   status: autoConfirm ? "CONFIRMED" : "PENDING_CONFIRMATION",
  //   ...(autoConfirm ? { confirmedById: user.id, confirmedAt: now } : {}),
  // and, inside the same tx when autoConfirm, re-aggregate CONFIRMED payments and
  // update the order exactly like confirm_payment does:
  //   const confirmedPaid = Number(agg._sum.amount ?? 0);
  //   const paymentState = paymentStateFor(confirmedPaid, 0, Number(order.totalPrice));
  //   await tx.gazoblokOrder.update({ where: { id: order.id }, data: { confirmedPaid, paymentState } });
  // plus a PAYMENT_CONFIRMED event with payload { paymentId: p.id, autoConfirmed: true }.
  // (Mirror of src/app/api/payments/route.ts:134-220 — read it before implementing.)
}
```

In **confirm_payment**, replace the `recomputePaymentState(...)` call at line 196 with:

```ts
const paymentState = paymentStateFor(confirmedPaid, 0, Number(order.totalPrice));
```

- [ ] **Step 6: Placement route** `src/app/api/gazoblok/orders/route.ts:167-177` — same auto-confirm treatment for the up-front payment: when `can(user, "payment.confirm")`, create it CONFIRMED with `confirmedById`/`confirmedAt`, set the order's `confirmedPaid` and `paymentState` (via `paymentStateFor`) in the same transaction, and log PAYMENT_CONFIRMED. Note the placement-time cap at `:94-97` already exists — keep it.

- [ ] **Step 7:** `npx vitest run` (full suite) — all green. `npm run build` — passes.

- [ ] **Step 8: Commit** `Fix(gazoblok) · payment ceiling, shared payment-state, owner auto-confirm`

---

### Task 2: Concurrency guards (CAS on status, confirm, order number)

**Files:**
- Modify: `src/app/api/gazoblok/orders/[id]/route.ts:76-106` (set_status transaction), `:178-189` (confirm update)
- Modify: `src/app/api/gazoblok/orders/route.ts:120-130` (order-number retry)

**Interfaces:**
- Produces: concurrent duplicate transitions return 409 `"Буюртма ҳолати ўзгарган · Order was changed — reload and retry"`; oversell warnings appear in the set_status response as `stockWarnings`.

- [ ] **Step 1: set_status compare-and-set.** Restructure the transaction: CAS first, stock second, event third. `updateMany` cannot do nested writes, so split:

```ts
const result = await prisma.$transaction(async (tx) => {
  const data: Prisma.GazoblokOrderUpdateManyMutationInput = { status: next };
  if (next === "DELIVERED" && order.status !== "DELIVERED") {
    data.deliveredAt = new Date();
    if (body.deliveryProofUrl) {
      data.deliveryProofUrl = body.deliveryProofUrl;
      data.deliveryProofUploadedAt = new Date();
    }
  }
  if (next === "CANCELED") {
    data.canceledAt = new Date();
    if (body.reason) data.cancelReason = body.reason;
  }

  // Compare-and-set: only wins if the status we validated against is still current.
  const cas = await tx.gazoblokOrder.updateMany({
    where: { id: order.id, status: order.status },
    data,
  });
  if (cas.count === 0) throw new Error("GAZOBLOK_STATUS_CONFLICT");

  let stockWarnings: NegativeStockWarning[] = [];
  if (next === "DELIVERED" && order.status !== "DELIVERED") {
    stockWarnings = await decrementGazoblokForOrder(tx, order.id, lineMoves, user.id);
  }

  await tx.gazoblokOrderEvent.create({ /* unchanged STATUS_CHANGED event */ });
  const o = await tx.gazoblokOrder.findUniqueOrThrow({ where: { id: order.id } });
  return { order: o, stockWarnings };
});
```

Catch the conflict outside:

```ts
} catch (e) {
  if (e instanceof Error && e.message === "GAZOBLOK_STATUS_CONFLICT") {
    return fail("Буюртма ҳолати ўзгарган — саҳифани янгиланг · Order was changed — reload and retry", 409);
  }
  throw e;
}
```

Response becomes `ok({ ...result.order, stockWarnings: result.stockWarnings })` — the UI task (Task 6) surfaces them. Import `NegativeStockWarning` from `@/lib/gazoblok-stock`.

Also **delete the dead restock branch** (lines 90-92, `restockGazoblokForCancellation` call + its import if now unused): DELIVERED is terminal per line 70-72, so the branch is unreachable. Update the PATCH doc comment (lines 45-52) to state: "DELIVERED is terminal; restock-on-cancel intentionally does not exist because CANCELED is only reachable before delivery."

- [ ] **Step 2: confirm_payment CAS.** Replace the unconditional `tx.gazoblokPayment.update` (line 179) with:

```ts
const cas = await tx.gazoblokPayment.updateMany({
  where: { id: payment.id, status: "PENDING_CONFIRMATION" },
  data: body.approve
    ? { status: "CONFIRMED", confirmedById: user.id, confirmedAt: new Date() }
    : { status: "REJECTED", confirmedById: user.id, confirmedAt: new Date(),
        notes: body.rejectionReason ?? payment.notes },
});
if (cas.count === 0) throw new Error("GAZOBLOK_PAYMENT_CONFLICT");
```

Map to `fail("Тўлов аллақачон кўриб чиқилган · Payment already reviewed", 409)` in the same catch pattern as Step 1.

- [ ] **Step 3: Order-number race retry** in `src/app/api/gazoblok/orders/route.ts`: wrap the create-transaction in a helper that retries **once** when Prisma throws `P2002` on `orderNumber`:

```ts
async function createWithRetry<T>(create: () => Promise<T>): Promise<T> {
  try {
    return await create();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return await create(); // number re-read inside → next free number
    }
    throw e;
  }
}
```

(The max-orderNumber read must happen inside `create()` for the retry to pick a fresh number — verify it already does; it is inside the transaction at `:123-128`.)

- [ ] **Step 4:** `npx vitest run` + `npm run build` — green.

- [ ] **Step 5: Commit** `Fix(gazoblok) · compare-and-set guards on status, confirm, order number`

---

### Task 3: State machine — deliver-blocked-until-paid, shipment transition rules

**Files:**
- Modify: `src/app/api/gazoblok/orders/[id]/route.ts:62-75` (set_status pre-checks)
- Modify: `src/app/api/gazoblok/orders/[id]/shipments/[sid]/route.ts` (require LOADED→DELIVERED, reject on CANCELED order)
- Modify: `src/app/api/gazoblok/orders/[id]/shipments/[sid]/load/route.ts` (check inside tx, reject CANCELED/DELIVERED order)

**Interfaces:**
- Consumes: Task 2's CAS structure (these pre-checks slot in before the transaction).
- Produces: DELIVERED requires balance 0 AND all shipments DELIVERED; the "stuck LOADED shipment" state becomes impossible.

- [ ] **Step 1: Deliver gate** in set_status, after the existing CANCELED/DELIVERED guards (line 72), add:

```ts
if (next === "DELIVERED" && order.status !== "DELIVERED") {
  // Owner rule (2026-07-23): core parity — no delivery with outstanding debt.
  const remaining = Number(order.totalPrice) - Number(order.confirmedPaid);
  if (remaining > 0.005) {
    return fail(
      "Тўлиқ тўланмаган буюртмани етказиб бўлмайди — аввал тўловни тасдиқланг · Order must be fully paid before delivery",
      409,
    );
  }
  const openShipments = await prisma.gazoblokShipment.count({
    where: { orderId: order.id, status: { not: "DELIVERED" } },
  });
  if (openShipments > 0) {
    return fail(
      "Аввал барча жўнатмаларни етказинг · Deliver all shipments first",
      409,
    );
  }
}
```

- [ ] **Step 2: Shipment status route** (`shipments/[sid]/route.ts`): where it currently rejects only `DELIVERED` (line 18), require the LOADED precondition and a live order:

```ts
if (shipment.status === "DELIVERED") return fail("Жўнатма аллақачон етказилган · Already delivered", 409);
if (body.status === "DELIVERED" && shipment.status !== "LOADED") {
  return fail("Аввал жўнатмани юкланг · Shipment must be loaded before delivery", 409);
}
if (order.status === "CANCELED") {
  return fail("Бекор қилинган буюртма жўнатмасини ўзгартириб бўлмайди · Order is canceled", 409);
}
```

(Read the file first — fetch the parent order if the route doesn't already.)

- [ ] **Step 3: Load route atomicity** (`load/route.ts`): move the "this + other shipments ≤ order totals" computation (currently lines 47-67, outside any tx) **inside** the existing `$transaction` (lines 82-102), re-reading sibling shipments within the tx. Add before it:

```ts
if (order.status === "CANCELED" || order.status === "DELIVERED") {
  return fail("Буюртма ёпилган — юклаб бўлмайди · Order is closed — cannot load", 409);
}
```

Keep the photo I/O before the transaction (files are harmless if tx aborts); only the guard+write move together. On guard failure inside the tx, throw `new Error("GAZOBLOK_OVERLOAD")` and map to the existing over-load error message outside.

- [ ] **Step 4:** `npx vitest run` + `npm run build` — green.

- [ ] **Step 5: Commit** `Fix(gazoblok) · deliver requires full payment + closed shipments; atomic load guard`

---

### Task 4: Authorization + input hardening

**Files:**
- Modify: `src/app/api/gazoblok/products/route.ts`, `products/[id]/route.ts`, `config/route.ts` (permission gates + comments)
- Modify: `src/app/api/gazoblok/orders/route.ts:20` (status query whitelist), `stock/route.ts`, `production/route.ts` (comments + FK pre-check)
- Modify: `src/lib/gazoblok-validation.ts` (producedAt bound, change ≠ 0)
- Test: extend `src/lib/gazoblok-validation.test.ts`

- [ ] **Step 1: Permission gates.** Switch the **mutating** handlers to `withPermission("pricing.edit", ...)` (import from `@/lib/api-auth`, same usage as `src/app/api/pricing/route.ts:53-54`):
  - `products/route.ts` POST
  - `products/[id]/route.ts` PATCH (both update and disable)
  - `config/route.ts` PUT/POST (whichever mutates)
  GET handlers stay `withAuth`.

- [ ] **Step 2: Fix every phantom-permission comment.** In all gazoblok route files, replace mentions of `gazoblok.view` / `gazoblok.manage` / `gazoblok.production` / `gazoblok.order` with the truth: `"auth-only (open to all logged-in users — owner decision)"` for reads/orders/stock/production, `"pricing.edit"` for catalog/config mutations, `"payment.confirm"` where already enforced.

- [ ] **Step 3: Validation tests** (extend `gazoblok-validation.test.ts`):

```ts
describe("GazoblokStockAdjustSchema", () => {
  it("rejects change of 0", () => {
    expect(GazoblokStockAdjustSchema.safeParse({ productId: "p1", change: 0 }).success).toBe(false);
  });
});
describe("GazoblokProductionSchema producedAt", () => {
  it("rejects a future date", () => {
    const tomorrow = new Date(Date.now() + 86_400_000);
    expect(GazoblokProductionSchema.safeParse({
      lines: [{ productId: "p1", quantity: 5 }], producedAt: tomorrow,
    }).success).toBe(false);
  });
});
```

Run — FAIL. Implement:

```ts
// GazoblokStockAdjustSchema: change: z.number().int().refine((c) => c !== 0, { message: "Ўзгариш 0 бўлиши мумкин эмас · Change cannot be zero" })
// GazoblokProductionSchema: producedAt: z.coerce.date().max(new Date(Date.now() + 5 * 60_000), { message: "Келажак санаси мумкин эмас · Future date not allowed" }).optional()
```

**Caution:** `z.date().max(...)` evaluates the bound at schema definition time. Use `.refine((d) => !d || d.getTime() <= Date.now() + 5 * 60_000, {...})` instead so the bound is per-request. Run — PASS.

- [ ] **Step 4: Status query whitelist** in `orders/route.ts:20`:

```ts
const STATUSES = ["PLACED", "IN_PRODUCTION", "DELIVERED", "CANCELED"] as const;
const statusParam = req.nextUrl.searchParams.get("status");
const status = STATUSES.includes(statusParam as any) ? (statusParam as (typeof STATUSES)[number]) : undefined;
```

- [ ] **Step 5: FK pre-checks** in `stock/route.ts` and `production/route.ts` POST: before writing, `findUnique` the product(s); unknown ID → `fail("Маҳсулот топилмади · Product not found", 422)` (pattern already at `orders/route.ts:59-63`).

- [ ] **Step 6: Duplicate-size server guard** in `products/route.ts` POST: before create, look for an existing **active** product with identical `lengthM`/`heightM`/`thicknessM`; if found → `fail("Бу ўлчам аллақачон мавжуд · This size already exists", 422)`.

- [ ] **Step 7:** `npx vitest run` + `npm run build` — green. **Commit** `Fix(gazoblok) · pricing.edit gate, honest comments, boundary validation`

---

### Task 5: Orders list page — honest errors, debounce, pending-payment visibility

**Files:**
- Modify: `src/app/(app)/gazoblok/orders/page.tsx`
- Modify: `src/app/api/gazoblok/orders/route.ts` GET (pending-payment flag)

**Interfaces:**
- Consumes: list GET response items gain `pendingPaymentCount: number`.
- Produces: query key stays `["gazoblok-orders", q, status]` — Task 6 invalidates by prefix `["gazoblok-orders"]`.

- [ ] **Step 1: API flag.** In the orders GET include, add `payments: { where: { status: "PENDING_CONFIRMATION" }, select: { id: true } }` and map each order to include `pendingPaymentCount: o.payments.length` (strip the raw payments array from the response).

- [ ] **Step 2: Error state.** Destructure `isError, refetch` from the useQuery at line 61. Before the empty-state branch (line 149):

```tsx
{isError ? (
  <div className="p-6 text-center space-y-2">
    <p className="text-sm text-muted-foreground">
      {t("Маълумотни юклаб бўлмади. Уланишни текширинг.", "Failed to load. Check your connection.")}
    </p>
    <Button variant="outline" size="sm" onClick={() => refetch()}>
      {t("Қайта уриниш", "Retry")}
    </Button>
  </div>
) : /* existing isLoading / empty / rows */}
```

- [ ] **Step 3: Debounce + keepPreviousData.** Add a debounced value for `q` (250 ms via `useEffect` + `setTimeout`, no new deps) used in the queryKey, and `placeholderData: keepPreviousData` (import from `@tanstack/react-query`) so rows stay visible while typing.

- [ ] **Step 4: Pending badge.** On each row, when `o.pendingPaymentCount > 0`, render the existing `Chip` (accent/warning variant used for partial payments) with `t("Тасдиқ кутилмоқда", "Awaiting confirmation")`. This is the owner's in-tab replacement for the core payments queue.

- [ ] **Step 5:** `npm run build` — green. **Commit** `Fix(gazoblok) · list error state, debounced search, pending-payment badge`

---

### Task 6: Order detail page — error card, dialogs, enum labels, invalidations

**Files:**
- Modify: `src/app/(app)/gazoblok/orders/[id]/page.tsx`
- Modify: `src/app/api/gazoblok/orders/[id]/route.ts:37` (events include actor)
- Create: `src/lib/gazoblok-labels.ts` (shared enum label maps)

**Interfaces:**
- Produces: `PAYMENT_METHOD_LABELS: Record<PaymentMethod, [uz: string, en: string]>` and `EVENT_TYPE_LABELS: Record<string, [uz: string, en: string]>` in `src/lib/gazoblok-labels.ts` — Task 11 (new page) reuses `PAYMENT_METHOD_LABELS`.

- [ ] **Step 1: Labels module** `src/lib/gazoblok-labels.ts`:

```ts
export const PAYMENT_METHOD_LABELS: Record<string, [string, string]> = {
  CASH: ["Нақд", "Cash"],
  BANK_TRANSFER: ["Банк ўтказмаси", "Bank transfer"],
  CLICK: ["Click", "Click"],
  PAYME: ["Payme", "Payme"],
  OTHER: ["Бошқа", "Other"],
};
export const EVENT_TYPE_LABELS: Record<string, [string, string]> = {
  ORDER_PLACED: ["Буюртма қабул қилинди", "Order placed"],
  STATUS_CHANGED: ["Ҳолат ўзгартирилди", "Status changed"],
  PAYMENT_RECORDED: ["Тўлов киритилди", "Payment recorded"],
  PAYMENT_CONFIRMED: ["Тўлов тасдиқланди", "Payment confirmed"],
  PAYMENT_REJECTED: ["Тўлов рад этилди", "Payment rejected"],
};
```

(Verify the actual event-type strings by grepping `gazoblokOrderEvent.create` / `type:` in the gazoblok routes; add any missing ones. Unknown types fall back to the raw string.)

- [ ] **Step 2: Error card.** Replace the `isLoading || !order` branch (line 195-197) with separate branches: loading → existing text; `isError || (!isLoading && !order)` → card with `t("Буюртмани юклаб бўлмади ёки топилмади.", "Failed to load or order not found.")` and a link back to `/gazoblok/orders` labeled `t("Буюртмаларга қайтиш", "Back to orders")`.

- [ ] **Step 3: Enum labels.** Payments table cell (line 435) and the record-payment `<Select>` options (lines 521-527) render via `PAYMENT_METHOD_LABELS[m] ? t(...PAYMENT_METHOD_LABELS[m]) : m`. Activity log (line 575) renders via `EVENT_TYPE_LABELS` the same way. API: add `actor: { select: { id: true, name: true } }` to the events include (line 37) and show the actor name in the log row.

- [ ] **Step 4: In-app dialogs.** Replace `window.confirm`/`window.prompt` (lines 175, 177, 480) with the app's dialog pattern (grep the main orders page for its cancel-confirmation dialog and mirror it):
  - Cancel: dialog with reason `<textarea>`, destructive primary button `t("Бекор қилиш", "Cancel order")`.
  - Deliver: confirm dialog stating `t("Захира камаяди. Давом этасизми?", "Stock will be decremented. Continue?")`.
  - Reject payment: dialog with reason textarea.

- [ ] **Step 5: Invalidations + gates.** In `refresh()` (line 130-132) also invalidate `["gazoblok-orders"]` (prefix) and — after DELIVERED — `["gazoblok", "stock"]`. Fix the float gate (lines 201-224): `const remainingNum = Math.max(0, Number(order.totalPrice) - Number(order.confirmedPaid)); const canRecordPayment = remainingNum > 0.005;`. Clear the error banner on confirm click (line 469, match `advance()` at 174). Client-side cap on the payment amount input: `max={remainingNum}` plus inline warning when exceeded. Surface `stockWarnings` from the set_status response (Task 2) as a warning banner: `t("Диққат: захира манфий бўлди", "Warning: stock went negative")`.

- [ ] **Step 6:** `npm run build` — green. **Commit** `Fix(gazoblok) · detail error card, in-app dialogs, enum labels, cache invalidation`

---

### Task 7: Stock + production pages — input protection, honest saves

**Files:**
- Modify: `src/app/(app)/gazoblok/stock/page.tsx:49-67, 176-181`
- Modify: `src/app/(app)/gazoblok/production/page.tsx:93-120, 163, 265+`

- [ ] **Step 1: Stock adjust.** Move `setChange(""); setNote("")` into the mutation's `onSuccess`. Add `onError` state rendered as a bilingual message next to the row's form: `t("Сақлаб бўлмади. Қайта уриниб кўринг.", "Failed to save. Try again.")`. In `onSuccess(data)`, when `data.resultingQuantity < 0`, show `t("Диққат: захира манфий бўлди", "Warning: stock is now negative")` as a warning (not error) near the row.

- [ ] **Step 2: Production partial lines.** Change `canSave` (line 120): valid only when **every** line is either fully empty (no product AND no qty) or fully filled (product AND qty ≥ 1 integer); strip fully-empty lines at submit. Mark partially-filled lines with `border-destructive` and a hint `t("Миқдорни киритинг", "Enter quantity")` / `t("Ўлчамни танланг", "Select size")`. Also filter already-selected products from other lines' `<Select>` options.

- [ ] **Step 3: History caption.** Above the production history list, add `t("Сўнгги 50 та ёзув", "Last 50 entries")` (the API caps at `take: 50`).

- [ ] **Step 4:** `npm run build` — green. **Commit** `Fix(gazoblok) · stock/production input protection and honest failures`

---

### Task 8: Catalog page — error branches, dirty-row preservation, archive semantics

**Files:**
- Modify: `src/app/(app)/gazoblok/catalog/page.tsx`

- [ ] **Step 1: Error branches.** Handle `productsQuery.isError` / `configQuery.isError` with the stock-page pattern (bilingual message + retry button) instead of falling through to the empty state. The two cards load independently (config error must not blank the products table).

- [ ] **Step 2: Dirty-row merge.** In the drafts-rebuild effect (lines 133-139): keep a `baselineRef` of the last server snapshot per product id; on refetch, overwrite a draft **only if** it still equals its baseline (not dirty). The row whose save just succeeded resets via its own `onSuccess`.

- [ ] **Step 3: Archive semantics.** Rename the disable button to `t("Архивлаш", "Archive")` and add a confirm step (inline two-tap: first tap turns the button into `t("Тасдиқлайсизми?", "Confirm?")` for 3 s, second tap fires — no new dialog component needed). Cross-invalidate `["gazoblok", "stock"]` in `patchProduct`, `createProduct`, `disableProduct` onSuccess.

- [ ] **Step 4: Small fixes.** Derived UZS/m³ shows `—` unless `pricePerBlock` parses to a positive number (lines 330-338). Fix mixed-script unit at line 433: `{t("UZS/м³", "UZS/m³")}`. Expose the `lowStockThreshold` field in the add-size form (visible input, default 50). Client duplicate-dims pre-check mirroring Task 4 Step 6 with the same bilingual message. Per-mutation error placement: row-level error text for `patchProduct`/`disableProduct`, form-level for create/grade (replace the single shared banner).

- [ ] **Step 5:** `npm run build` — green. **Commit** `Fix(gazoblok) · catalog error states, dirty-row preservation, archive confirm`

---

### Task 9: Shipments section — design-system compliance, delete confirm, delivery coherence

**Files:**
- Modify: `src/components/gazoblok/GazoblokShipmentsSection.tsx`

- [ ] **Step 1: Chips + tokens.** Replace `STATUS_COLORS` (lines 38-42) with the shared `Chip` component: PENDING → `neutral`, LOADED → `warning`, DELIVERED → `success`. Replace `text-emerald-600`/`text-amber-*` at line 214 with `text-success`/`text-warning` tokens (grep `globals.css`/`tailwind.config` first to confirm the exact token names — do not invent).

- [ ] **Step 2: i18n + errors.** Give `STATUS_LABEL_UZ` an English half rendered via the `t()`/`lang-en` mechanism used elsewhere in the file; bilingualize "Жўнатма {n}". Replace every `"Failed"` fallback (lines 69, 86, 103 area) with `t("Хатолик юз берди. Қайта уриниб кўринг.", "Something went wrong. Try again.")` and wrap `res.json()` in try/catch so HTML error pages don't crash the handler.

- [ ] **Step 3: Delete confirm + a11y.** The Trash2 button gets `aria-label={t("Ўчириш", "Delete")}` and the same two-tap confirm pattern as Task 8 Step 3.

- [ ] **Step 4: Delivery coherence.** Server now guarantees the order can't be DELIVERED while shipments are open (Task 3), so the stuck state is impossible going forward. Remove the `canAddMore` wrapper from the **status-advance buttons** (keep it only around "add shipment"), so a LOADED shipment on any non-CANCELED order always shows its `t("Етказилди", "Delivered")` action.

- [ ] **Step 5:** `npm run build` — green. **Commit** `Fix(gazoblok) · shipment chips, i18n, delete confirm, delivery coherence`

---

### Task 10: Split-shipment modal — proper Dialog, input handling

**Files:**
- Modify: `src/components/gazoblok/GazoblokSplitShipmentModal.tsx`

- [ ] **Step 1: Dialog primitive.** Rebuild the shell (lines 140-141) on the existing shadcn `Dialog` (`@/components/ui/dialog`, already used elsewhere — grep to confirm import path): gives focus trap, Escape, backdrop close, `role="dialog"`, scroll lock for free. Keep the inner layout.

- [ ] **Step 2: Inputs.** Per-line qty inputs get `aria-label` of the product label and use the shared `Input` component. Truck-capacity fields (lines 185, 195, 215) switch to string state parsed on blur/apply — no more `parseInt(x) || 10000` snapping mid-edit.

- [ ] **Step 3: Cleanup.** `URL.revokeObjectURL` in `removeFile` and on unmount (line 85). Replace `toLocaleString("ru-RU")` calls (lines 159, 300-306) with the shared `formatNumber` from `@/lib/utils`. Bilingual "+ Машина"/"− Машина" via `t()`. `alt` texts via `t("Расм", "Photo")`.

- [ ] **Step 4:** `npm run build` — green. **Commit** `Fix(gazoblok) · split modal a11y, input handling, shared formatting`

---

### Task 11: New-order page — catalog states, add feedback, payment coupling

**Files:**
- Modify: `src/app/(app)/gazoblok/new/page.tsx`

**Interfaces:**
- Consumes: `PAYMENT_METHOD_LABELS` from `src/lib/gazoblok-labels.ts` (Task 6) — replace the inline method labels (lines 646-653) so the app has exactly one source.

- [ ] **Step 1: Catalog states.** Products/config queries (lines 80-87) get `isLoading`/`isError` handling: loading → disabled select with `t("Юкланмоқда…", "Loading…")`; error → message + retry; success-but-empty → `t("Каталог бўш — аввал ўлчам қўшинг", "Catalog is empty — add a size first")` with a link to `/gazoblok/catalog`.

- [ ] **Step 2: Add-to-order feedback.** After `addEstimateToOrder` (line 171-195): the button (line 556-564) swaps to `t("Қўшилди ✓", "Added ✓")` for 1.5 s and is disabled during that window (kills the double-click 2× bug); scroll the lines section into view via a ref.

- [ ] **Step 3: Payment coupling + caps.** When `paidAmount > 0`, mark the method select required and block submit without it (mirrors the Task 1 server refine, with the same bilingual message). Warn inline when `paidAmount` exceeds the computed total. Enter key adds the line: wrap the add-line row (lines 349-387) in a `<form onSubmit={addLine}>`.

- [ ] **Step 4:** `npm run build` — green. **Commit** `Fix(gazoblok) · new-order catalog states, add feedback, payment coupling`

---

### Task 12: Production void

**Files:**
- Modify: `prisma/schema.prisma` (GazoblokProductionEntry: add `voidedAt DateTime?`, `voidedById String?` + relation)
- Modify: `src/app/api/gazoblok/production/route.ts` (PATCH action `void`)
- Modify: `src/app/(app)/gazoblok/production/page.tsx` (void button + voided rendering)

**Interfaces:**
- Consumes: `applyGazoblokMovement(tx, productId, change, meta)` from `@/lib/gazoblok-stock` with `meta.reason = "MANUAL_ADJUSTMENT"`, `meta.productionEntryId = entry.id`, `meta.note = "production void"`.

- [ ] **Step 1: Schema.** Add the two columns; run `npx prisma db push` against the **local** dev DB only. Record in the commit message that prod needs `db push` at deploy time.

- [ ] **Step 2: Void endpoint.** PATCH `/api/gazoblok/production` body `{ action: "void", entryId }`, `withAuth`. In one transaction: CAS `updateMany({ where: { id: entryId, voidedAt: null }, data: { voidedAt: now, voidedById: user.id } })` (count 0 → 409 `"Аллақачон бекор қилинган · Already voided"`), then post one reversing movement per entry line (negative of the original quantity, linked via `productionEntryId`), then `recordAudit`.

- [ ] **Step 3: UI.** Each non-voided entry gets a void button (two-tap confirm, Task 8 pattern) labeled `t("Бекор қилиш", "Void")`; voided entries render struck-through with `t("Бекор қилинган", "Voided")` chip. Invalidate production + stock + products keys on success.

- [ ] **Step 4:** `npx vitest run` + `npm run build` — green. **Commit** `Feat(gazoblok) · void production entries with reversing stock movement`

---

### Task 13: Touch targets + polish batch

**Files:**
- Modify: `src/app/(app)/gazoblok/stock/page.tsx:199-222`, `production/page.tsx:222-230`, `orders/page.tsx:132`, `new/page.tsx:428-435`, `GazoblokShipmentsSection.tsx:137-143`

- [ ] **Step 1: 44px targets.** Warehouse-floor controls (stock adjust inputs/button, production remove-line, list filter tabs, line-remove X, modal preview-remove) get ≥44px hit areas on touch — use `h-11 md:h-8`-style responsive sizing or padding expansion, keeping desktop density.

- [ ] **Step 2: Odds and ends.** Replace the hand-rolled chevron SVG (`GazoblokShipmentsSection.tsx:137-143`) with lucide `ChevronDown`; bilingual `alt` texts on receipt/proof images in the detail page (line 448); left-border on stock rows only for `low`/`critical` tiers (stock page 157-161); fix the placeholder typo `"парти №42"` → `"партия №42"` (production page 172).

- [ ] **Step 3:** `npm run build` — green. **Commit** `Fix(gazoblok) · touch targets and polish batch`

---

### Task 14: Full verification on localhost (no deploy)

**Files:** none (verification only)

- [ ] **Step 1:** `npx vitest run` — entire suite green. `npm run lint` — clean. `npm run build` — zero errors.

- [ ] **Step 2:** Start `npm run dev` and walk this manual checklist (both light and dark theme):
  1. `/gazoblok/orders` — kill the dev server mid-view → error card with retry appears (not "Буюртма йўқ"); restart → retry works. Search types smoothly without table blanking.
  2. Place an order on `/gazoblok/new` with `paidAmount > 0` and no method → blocked client-side with bilingual message. With method → order created; as an owner (payment.confirm) the payment lands CONFIRMED immediately.
  3. Record a payment exceeding the remaining balance → 422 with bilingual message.
  4. Try to mark an unpaid order DELIVERED → 409 «Тўлиқ тўланмаган…». Confirm full payment, leave a shipment LOADED → 409 «Аввал барча жўнатмаларни етказинг». Deliver the shipment, then the order → succeeds; stock decremented once; orders list and stock page reflect it without hard refresh.
  5. As a non-`pricing.edit` user, PATCH a catalog price → 403; UI shows the failure (no silent success).
  6. Stock adjust with dev server killed → error shown, input values preserved.
  7. Production entry with a half-filled second line → Save blocked, line highlighted. Void an entry → stock reverses, entry struck through.
  8. Catalog: edit two rows, save one → the other keeps its edits. Archive button asks for confirmation.
  9. Split-shipment modal: Escape closes, focus stays trapped, capacity field doesn't snap while clearing.
  10. Payments table shows «Банк ўтказмаси», not `BANK_TRANSFER`; activity log shows Uzbek labels + actor names.

- [ ] **Step 3:** Report results to the owner with any deviations. **STOP — do not push, do not deploy.** Await explicit owner confirmation.
