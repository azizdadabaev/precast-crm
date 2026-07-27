# Order Discount Mode Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Preserve the discount TYPE (fixed amount vs percentage) on an order so editing it keeps digits-as-digits and percent-as-percent — fixing the bug where an amount discount (776,400 → total 29,000,000) comes back on edit as a rounded percentage (2.61% → 777,164 → 28,999,236).

**Root cause:** (1) `loadOrder()` in `calculations/page.tsx` restores only `discountPercent` from the order, never `discountAmount`; (2) the data model can't distinguish type — create/edit store BOTH a back-computed rounded percent and the amount, so the type the user chose is lost.

**Architecture:** Add a nullable `discountMode` (AMOUNT | PERCENT) to `Order`, set from the same branch that already decides precedence (`discountAmount > 0 ? AMOUNT : PERCENT`) in the shared `computeOrderTotals`. Store it on create/edit. On edit-load, a pure `restoreDiscountInputs()` helper returns exactly one non-zero field based on the mode (legacy null → infer from amount). Both stored numbers are kept for reports/receipts.

**Tech Stack:** Next.js 14, Prisma + PostgreSQL, Zustand calculator store, Vitest 2.x.

## Global Constraints

- **NO `git push`, NO deploy.** Local commits only. Owner tests on localhost.
- Money logic — reuse existing precedence (`amount > 0` wins, capped at subtotal). No new float patterns.
- Keep storing BOTH `discountPercent` and `discountAmount` (owner chose to keep both for reports). `discountMode` only disambiguates type.
- Bilingual UI unaffected (this is data/logic). Test: `npx vitest run <file>`; full `npx vitest run` (baseline 1311 passed / 1 skipped) + `npx tsc --noEmit`.
- **Do NOT run `npm run build`** during tasks — a dev server holds the Prisma DLL; the controller runs the production build separately. Gate on `tsc` + vitest.
- `discountMode` column ⇒ **prod needs `npx prisma db push` at deploy** (note in commit).
- Commit style `Fix(orders) · …`.

## File map
- `src/lib/order-totals.ts` — `computeOrderTotals` returns `discountMode`; new pure `restoreDiscountInputs()`.
- `src/lib/order-totals.test.ts` — tests (create if absent; else extend).
- `prisma/schema.prisma` — `enum DiscountMode`; `Order.discountMode DiscountMode?`.
- `src/lib/create-order.ts` — store `discountMode`.
- `src/app/api/orders/[id]/edit/route.ts` — store `discountMode`.
- `src/app/api/projects/[id]/add-to-order/route.ts` — mode-aware rescale.
- `src/app/(app)/calculations/page.tsx` — `loadOrder` restores via helper.

---

### Task 1: `order-totals.ts` — discountMode + restore helper (TDD)

**Files:**
- Modify: `src/lib/order-totals.ts`
- Create/Modify: `src/lib/order-totals.test.ts`

**Interfaces:**
- Produces: exported `type DiscountMode = "AMOUNT" | "PERCENT"`; `OrderTotals` (the return of `computeOrderTotals`) gains `discountMode: DiscountMode`; new `restoreDiscountInputs(o) → { discountPercent, discountAmount }`.

- [ ] **Step 1: Write failing tests** — in `src/lib/order-totals.test.ts` (read the file's existing test style first; if the file doesn't exist, create it mirroring another `src/lib/*.test.ts`). Also confirm `vitest.config.ts` `test.include` covers `src/lib/*.test.ts` (it was added earlier — verify; if not, add it):

```ts
import { describe, it, expect } from "vitest";
import { computeOrderTotals, restoreDiscountInputs } from "./order-totals";

const rooms = [{ roomsSubtotal: 1_000_000 }]; // shape per computeOrderTotals' actual input — adapt to the real signature after reading the file

describe("computeOrderTotals discountMode", () => {
  it("reports AMOUNT when an explicit amount is given", () => {
    const t = computeOrderTotals(/* rooms */ [], { discountPercent: 0, discountAmount: 100, deliveryCost: 0, otherCost: 0 } as any, /* pricing */ undefined as any);
    expect(t.discountMode).toBe("AMOUNT");
  });
  it("reports PERCENT when only a percent is given", () => {
    const t = computeOrderTotals([], { discountPercent: 10, discountAmount: 0, deliveryCost: 0, otherCost: 0 } as any, undefined as any);
    expect(t.discountMode).toBe("PERCENT");
  });
});

describe("restoreDiscountInputs", () => {
  it("AMOUNT mode → exact amount, zero percent (the reported bug)", () => {
    expect(restoreDiscountInputs({ discountMode: "AMOUNT", discountPercent: 2.61, discountAmount: 776_400 }))
      .toEqual({ discountPercent: 0, discountAmount: 776_400 });
  });
  it("PERCENT mode → percent, zero amount", () => {
    expect(restoreDiscountInputs({ discountMode: "PERCENT", discountPercent: 10, discountAmount: 62_000 }))
      .toEqual({ discountPercent: 10, discountAmount: 0 });
  });
  it("legacy null + amount>0 → infers AMOUNT", () => {
    expect(restoreDiscountInputs({ discountMode: null, discountPercent: 2.61, discountAmount: 776_400 }))
      .toEqual({ discountPercent: 0, discountAmount: 776_400 });
  });
  it("legacy null + amount 0 + percent>0 → infers PERCENT", () => {
    expect(restoreDiscountInputs({ discountMode: null, discountPercent: 10, discountAmount: 0 }))
      .toEqual({ discountPercent: 10, discountAmount: 0 });
  });
});
```

NOTE: `computeOrderTotals`' real parameter shape must be taken from the file — the `[]`/`as any` above are placeholders for the rooms/pricing args; keep the discount-opts object accurate and adapt the rooms/pricing args to the real signature so the two mode tests compile and run. The `restoreDiscountInputs` tests are exact and must pass as written.

- [ ] **Step 2: Run — expect FAIL** (`discountMode`/`restoreDiscountInputs` don't exist): `npx vitest run src/lib/order-totals.test.ts`

- [ ] **Step 3: Implement** in `src/lib/order-totals.ts`:
  (a) Export the type and add it to the totals interface:
```ts
export type DiscountMode = "AMOUNT" | "PERCENT";
// add to the OrderTotals interface: discountMode: DiscountMode;
```
  (b) In `computeOrderTotals`, the existing `if (opts.discountAmount > 0) { … } else { … }` block already IS the mode decision. Set `const discountMode: DiscountMode = opts.discountAmount > 0 ? "AMOUNT" : "PERCENT";` and include `discountMode` in the returned object.
  (c) Add the pure helper:
```ts
/**
 * Reconstruct the calculator's two discount inputs from a stored order,
 * returning exactly ONE non-zero field so the mutually-exclusive
 * percent/amount inputs restore the SAME type the operator chose.
 * Legacy rows (no mode) infer AMOUNT when an amount was stored.
 */
export function restoreDiscountInputs(o: {
  discountMode: DiscountMode | null | undefined;
  discountPercent: number;
  discountAmount: number;
}): { discountPercent: number; discountAmount: number } {
  const mode = o.discountMode ?? (o.discountAmount > 0 ? "AMOUNT" : "PERCENT");
  return mode === "AMOUNT"
    ? { discountPercent: 0, discountAmount: o.discountAmount }
    : { discountPercent: o.discountPercent, discountAmount: 0 };
}
```

- [ ] **Step 4: Run — expect PASS**: `npx vitest run src/lib/order-totals.test.ts`
- [ ] **Step 5:** Full `npx vitest run` (1311 + new = green) + `npx tsc --noEmit` (exit 0).
- [ ] **Step 6: Commit**
```bash
git add src/lib/order-totals.ts src/lib/order-totals.test.ts vitest.config.ts
git commit -m "Fix(orders) · computeOrderTotals reports discountMode; add restoreDiscountInputs"
```

---

### Task 2: Persist `discountMode` (schema + create + edit + add-to-order)

**Files:**
- Modify: `prisma/schema.prisma`, `src/lib/create-order.ts`, `src/app/api/orders/[id]/edit/route.ts`, `src/app/api/projects/[id]/add-to-order/route.ts`

**Interfaces:**
- Consumes: `DiscountMode`, `computeOrderTotals().discountMode` from Task 1.

- [ ] **Step 1: Schema.** Add to `prisma/schema.prisma`:
```prisma
enum DiscountMode {
  AMOUNT
  PERCENT
}
```
and in `model Order` (near `discountPercent`/`discountAmount`, ~line 401):
```prisma
  // Which input produced the discount, so editing restores the same type
  // (an exact amount stays an amount; a percent stays a percent and
  // re-scales). Nullable: legacy orders infer from discountAmount.
  discountMode DiscountMode?
```
Run `npx prisma db push` (dev servers stopped ⇒ DLL free; if EPERM, note it and rely on `prisma generate` having updated types). Confirm the column + enum exist in the generated client.

- [ ] **Step 2: create-order.ts.** `createOrder` already destructures `discountAmount, resolvedDiscountPercent` from `computeOrderTotals` (~line 100). Also pull `discountMode` from it, and add to the `order.create({ data: { … } })` (~line 266):
```ts
        discountMode,
```

- [ ] **Step 3: edit route.** In `src/app/api/orders/[id]/edit/route.ts`, the inline precedence block (~91-101) mirrors computeOrderTotals. Add right after it:
```ts
    const discountMode: "AMOUNT" | "PERCENT" = body.discountAmount > 0 ? "AMOUNT" : "PERCENT";
```
Add `discountMode` to the `tx.order.update({ data: { … } })` payload (~line 169) and to `newSnapshot` (~137) for the audit event.

- [ ] **Step 4: add-to-order — mode-aware rescale.** In `src/app/api/projects/[id]/add-to-order/route.ts` (~70-88): currently keeps `discountAmount` fixed and rebases percent. Make it respect the order's mode so a PERCENT order keeps its percentage:
```ts
    const mode = order.discountMode ?? (Number(order.discountAmount) > 0 ? "AMOUNT" : "PERCENT");
    let discountAmount: number;
    let resolvedPercent: number;
    if (mode === "PERCENT") {
      resolvedPercent = Number(order.discountPercent);
      discountAmount = newSubtotal * (resolvedPercent / 100);
    } else {
      discountAmount = Number(order.discountAmount);
      resolvedPercent = discountAmount > 0 && newSubtotal > 0
        ? Math.round((discountAmount / newSubtotal) * 10000) / 100 : 0;
    }
    const totalPrice = newSubtotal - discountAmount + Number(order.deliveryCost) + Number(order.otherCost);
```
Store `discountAmount` too in the update (it currently stores only `discountPercent: resolvedPercent` at ~87 — add `discountAmount` so a PERCENT order's rescaled amount persists). Do NOT write `discountMode` here (it persists unchanged).

- [ ] **Step 5:** `npx vitest run` (green) + `npx tsc --noEmit` (exit 0).
- [ ] **Step 6: Commit**
```bash
git add prisma/schema.prisma src/lib/create-order.ts "src/app/api/orders/[id]/edit/route.ts" "src/app/api/projects/[id]/add-to-order/route.ts"
git commit -m "Fix(orders) · persist discountMode on create/edit; mode-aware add-to-order (prod needs db push at deploy)"
```

---

### Task 3: Restore discount by mode on edit-load

**Files:**
- Modify: `src/app/(app)/calculations/page.tsx`

**Interfaces:**
- Consumes: `restoreDiscountInputs` from `@/lib/order-totals`.

- [ ] **Step 1.** In `loadOrder()` (~387), extend the fetched order type (~389-418) to include `discountAmount: string;` and `discountMode: "AMOUNT" | "PERCENT" | null;`. Then replace the single `discountPercent: Number(order.discountPercent)` in the `loadFrom({…})` call (~441) with both fields from the helper:
```ts
        ...restoreDiscountInputs({
          discountMode: order.discountMode,
          discountPercent: Number(order.discountPercent),
          discountAmount: Number(order.discountAmount),
        }),
```
Import `restoreDiscountInputs` from `@/lib/order-totals`. Verify `GET /api/orders/[id]` returns `discountAmount` and `discountMode` (it returns the full order via Prisma; `discountMode` exists after Task 2, `discountAmount` is an existing column) — if the route uses a `select`, add the two fields.

- [ ] **Step 2:** `npx tsc --noEmit` (exit 0). (No component test harness; the pure logic is covered in Task 1.)

- [ ] **Step 3: Commit**
```bash
git add "src/app/(app)/calculations/page.tsx"
git commit -m "Fix(orders) · restore discount by mode when editing an order"
```

---

### Task 4: Verification (localhost, no deploy)

- [ ] **Step 1:** `npx vitest run` green, `npx tsc --noEmit` exit 0, controller runs clean `npm run build` (exit 0).
- [ ] **Step 2:** On the dev server: create an order with a **fixed-amount** discount that rounds the total (e.g. amount to hit 29,000,000). Press edit → the amount is restored **exactly** (percent field 0, total still 29,000,000 — no drift). Save, re-edit → still stable. Then create an order with a **percent** discount (e.g. 10%) → edit restores it as 10% (amount field 0); add a room → the discount stays 10% and rescales. Confirm receipts/print still show the discount.
- [ ] **Step 3:** Report; **STOP — no push/deploy.** Note prod needs `npx prisma db push`.
