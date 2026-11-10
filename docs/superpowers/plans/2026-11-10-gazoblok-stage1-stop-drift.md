# Gazoblok Stage 1 — Stop the Drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make gazoblok stock, money and quantities match the yard: per-truck stock, strict ordered/loaded/left, confirmed over-loading with attributed debt, close short, refunds, permissions like beam-and-block, one quote rule.

**Architecture:** Pure rules in new `src/lib/gazoblok-quantities.ts` and `src/lib/gazoblok-rules.ts` (unit-tested); routes under `src/app/api/gazoblok/**` call them inside row-locked transactions; schema gains additive columns/enum values; a dry-run-first reconcile script fixes existing open orders; the order screen shows the four quantities, debt, refund and who·what·when history.

**Tech Stack:** Next 14, TypeScript strict, Prisma (`db push`, no migrations folder), zod, vitest (node env, `tests/**/*.test.ts`), Tailwind + `src/components/ui/*`, `<Bi>`/`useT`.

**Spec:** `docs/superpowers/specs/2026-11-10-gazoblok-renovation-design.md` (approved 2026-11-10). Research: `C:\Users\aziz\Downloads\gazoblok-renovation-research-2026-10-20.md` Appendix B (line references valid; no gazoblok code changed since).

Paths are relative to `precast-crm/` in worktree `.claude/worktrees/gazoblok-reno` (branch `feat/gazoblok-renovation`).

## Global Constraints

- UI strings Uzbek Cyrillic via `<Bi>`/`useT(uz,en)`; API errors keep the existing `"Узбекча · English"` pattern; money in messages via `formatNumber`.
- Every state change writes a `GazoblokOrderEvent` (actorId, Uzbek message, payload) or stock movement with actorId.
- Locks: every money/stock/status write on an order starts its transaction with `SELECT id FROM gazoblok_orders WHERE id=$1 FOR UPDATE` and re-reads the order inside.
- Permissions per spec §4.7 table (existing keys only).
- Over-load extra bills at the line's frozen `unitPrice` (no discount). Unpaid over-load = `min(overshipAmount, total − confirmedPaid)`.
- DELIVERED requires: every line loaded ≥ ordered OR `shortClosedAt` set; every shipment DELIVERED; remaining ≤ 0.005. DELIVERED moves no stock.
- Cancel requires `order.cancel` and zero loaded blocks.
- Truck counts change only while the order is open (not DELIVERED / CANCELED / short-closed).
- Schema changes additive and nullable; local DB = isolated `precast_crm_gazoblok_reno` (never the shared `precast_crm`); prod only at deploy with the owner.
- No push/deploy until the owner says "deploy"; screenshots before.

## Review Focus

1. **Re-loading a LOADED shipment with smaller counts** (operator typo corrected) — stock goes back up by exactly the difference, total and over-load recompute down. → Task 3 test `correction posts the difference`.
2. **Short-closed order with partial payment** — new total lower, stays open with debt; if paid > new total, refund owed appears. → Task 4 test `close short re-bills and can create refund owed`.
3. **Order placed before the switch with trucks already loaded** — first correction must not double-count stock (the reconcile script hasn't run locally). → Task 3 test `first touch of a pre-switch shipment` + Task 2 reconcile planner.
4. **Driver/yard user without `order.view`** opening a gazoblok URL — 403 page/API, not a crash. → Task 5 test on the permission map + manual check.
5. **Two payments posted at once for the full remaining amount** — second is refused. → Task 4 test via the extracted `paymentCeilingProblem` + lock.

---

### Task 1: Quantity model and pure rules

**Files:** Create `src/lib/gazoblok-quantities.ts`, `src/lib/gazoblok-rules.ts`; Test `tests/gazoblok-quantities.test.ts`, `tests/gazoblok-rules.test.ts`

**Interfaces — Produces:**
- `type LineQty = { lineId: string; productId: string | null; label: string; ordered: number; loaded: number; left: number; over: number }`
- `lineQuantities(lines: {id; productId; productLabel; quantity}[], shipments: {loadedLines: unknown}[]): LineQty[]` — ignores unknown line ids.
- `loadDelta(prev: Record<string,number>|null, next: Record<string,number>): Record<string,number>` — per line next − prev (non-zero only).
- `overloadLines(lines, otherShipments, nextLoaded): { lineId; extra: number }[]` — lines that would exceed ordered after this load.
- `unpaidOverload(o: { overshipAmount; totalPrice; confirmedPaid }): number`
- `shortCloseTotals(lines: {id; quantity; unitPrice}[], loadedByLine: Map<string,number>, o: { linesSubtotal; discountAmount; deliveryCost }): { linesSubtotal: number; discountAmount: number; totalPrice: number }` — lines at loaded × unitPrice, discount scaled by newSubtotal/oldSubtotal, delivery unchanged, round2; over-loaded lines bill at loaded (no separate overship).
- `parseDecimal(s: string): number | null` — accepts `7,5` / `7.5` / ` 7 ` → 7.5/7.5/7; `""`/`abc`/`7,5,1` → null.
- In `gazoblok-rules.ts`: `canDeliver(o: { lines: LineQty[]; shortClosed: boolean; openShipments: number; remaining: number }): string | null`, `canCancel(o: { totalLoaded: number }): string | null`, `paymentCeilingProblem(amount: number, remaining: number): string | null` (message with `formatNumber`), `isOpen(o: { status; shortClosedAt }): boolean`.

- [ ] **Step 1: Failing tests** — fixture lines A(200 ordered, 18 000), B(100, 20 000):
  - `lineQuantities` with shipments `{A:150}`, `{A:250,B:100,ghost:5}` → A {ordered 200, loaded 400, left 0, over 200}, B {100,100,0,0}; ghost ignored.
  - `loadDelta({A:150},{A:120,B:10})` → `{A:-30,B:10}`; `loadDelta(null,{A:5})` → `{A:5}`.
  - `overloadLines` A ordered 200, other loaded 150, next {A:100} → `[{lineId:"A", extra:50}]`; next {A:50} → `[]`.
  - `unpaidOverload({overshipAmount:900000,totalPrice:5000000,confirmedPaid:4500000})` → 500000; paid 4 000 000 → 900000; paid 5 000 000 → 0.
  - `shortCloseTotals` lines A(200×18000), B(100×20000), loaded A 150 B 0, subtotal 5 600 000, discount 560 000, delivery 300 000 → subtotal 2 700 000, discount 270 000, total 2 730 000.
  - `parseDecimal` cases above.
  - `canDeliver`: not all loaded & not short → message; shortClosed → null when trucks done & paid; open trucks → message; remaining 10 → message.
  - `canCancel({totalLoaded:1})` → message containing «юкланган»; 0 → null.
  - `paymentCeilingProblem(1000001, 1000000)` → message containing `1 000 000`; equal → null.
- [ ] **Step 2: Run** `npx vitest run tests/gazoblok-quantities.test.ts tests/gazoblok-rules.test.ts` — FAIL (missing modules).
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `Feat(gazoblok) · quantity model and pure order rules`.

### Task 2: Schema, stock reasons, reconcile script

**Files:** Modify `prisma/schema.prisma` (enum `GazoblokStockReason` += `SHIPMENT_LOAD`, `SHIPMENT_CORRECTION`; `GazoblokStockMovement` += `shipmentId String?`; `GazoblokOrder` += `createdById String?` (+ relation `User` named "GazoblokOrderCreator", index), `shortClosedAt DateTime?`, `shortCloseReason String?`, `shortClosedById String?`); Modify `src/lib/gazoblok-stock.ts` (`GazoblokStockReason` type, `MovementMeta.shipmentId`); Create `src/lib/gazoblok-reconcile.ts`, `scripts/gazoblok-reconcile-stock.ts`; Test `tests/gazoblok-reconcile.test.ts`.

**Interfaces — Produces:**
- `planStockReconcile(orders: { id; orderNumber; status; lines: {id; productId; productLabel}[]; shipments: {id; number; status; loadedLines}[]; movements: {shipmentId: string|null; productId; change}[]; placedEventActorId: string|null; createdById: string|null }[], includeCanceled: Set<string>): { moves: { orderId; orderNumber; shipmentId; productId; label; change: number }[]; canceledWithLoads: { orderNumber; blocks: number }[]; createdByBackfill: { orderId; userId }[] }` — open orders (PLACED/IN_PRODUCTION) and named canceled ones: for each LOADED/DELIVERED shipment, change = −(loaded − already posted for that shipment+product); DELIVERED orders skipped.
- Script: `npx tsx scripts/gazoblok-reconcile-stock.ts [--apply] [--include-canceled=B-2026-07-0003,...]` — prints report; `--apply` posts `SHIPMENT_LOAD` movements via `applyGazoblokMovement` + `createdById` backfill in one transaction, writes `gazoblok-reconcile-undo-<timestamp>.json` (inverse moves).

- [ ] **Step 1: Failing test** — open order with shipment#1 LOADED {A:150} and no movements → move −150; same with an existing movement −100 for that shipment → −50; DELIVERED order → none; CANCELED order with loads not named → in `canceledWithLoads`, no move; named → moved; createdById null + event actor "u1" → backfill.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** schema, stock types, planner, script. Create local DB: set worktree `.env` `DATABASE_URL` → `precast_crm_gazoblok_reno`, `npx prisma db push`, `npm run db:seed`.
- [ ] **Step 4: Run** test + `npx tsc --noEmit` — PASS; `npx tsx scripts/gazoblok-reconcile-stock.ts` prints an empty report.
- [ ] **Step 5: Commit** `Feat(gazoblok) · per-shipment stock reasons, order attribution, reconcile script`.

### Task 3: Loading a truck moves stock (and is confirmed when over)

**Files:** Modify `src/app/api/gazoblok/orders/[id]/shipments/[sid]/load/route.ts`; Test `tests/gazoblok-load.test.ts` (pure helper `planLoad` exported from `src/lib/gazoblok-quantities.ts`).

**Interfaces — Consumes:** Task 1 `loadDelta`, `overloadLines`, `isOpen`; Task 2 reasons. **Produces:** `planLoad(input: { lines; otherShipments; prevLoaded: Record<string,number>|null; postedForShipment: Record<string /*productId*/, number>; nextLoaded: Record<string,number> }): { unknownLineIds: string[]; overload: {lineId; extra}[]; stockMoves: { productId: string; change: number }[] }` — stock change per product = −(next − alreadyPosted) so a pre-switch shipment with nothing posted gets its full count on first touch.

Route rules: permission `order.edit` (shipment DELIVERED → also `order.editShipped`); order must be `isOpen`; reject `unknownLineIds` (422); if `overload` non-empty and form field `confirmOverload` ≠ "true" → 409 `{ code: "OVERLOAD_CONFIRM_REQUIRED", overload, extraAmount }`; under the lock: update shipment, post `stockMoves` (`SHIPMENT_LOAD` first load / `SHIPMENT_CORRECTION` re-load, with `shipmentId`), recompute overship/total/paymentState as today, event `SHIPMENT_LOADED` or `SHIPMENT_CORRECTED` with `{before, after, overshipDelta}`.

- [ ] **Step 1: Failing tests** — `correction posts the difference` (prev {A:150} posted −150, next {A:120} → +30); `first touch of a pre-switch shipment` (prev {A:150}, nothing posted, next {A:150} → −150); unknown id reported; overload detected.
- [ ] **Step 2–4:** run FAIL → implement helper + route → PASS + tsc.
- [ ] **Step 5: Commit** `Feat(gazoblok) · stock moves per truck; over-load needs confirmation`.

### Task 4: Order actions — deliver, close short, cancel, payments, refund

**Files:** Modify `src/app/api/gazoblok/orders/[id]/route.ts`, `src/lib/gazoblok-validation.ts` (actions `close_short {reason: string min 3}`, `record_refund {amount>0, method, notes?}`); Test `tests/gazoblok-order-actions.test.ts` (pure: `nextStatusProblem`, `closeShortPlan`, refund via `refundDue({...o, writeOffAmount: 0})`).

Rules: `set_status` — reject X→X; DELIVERED via `canDeliver` (no stock move); CANCELED needs `order.cancel` + `canCancel`; IN_PRODUCTION/PLACED needs `order.edit`. `close_short` (`order.edit`, open, ≥1 shipment loaded): sets short fields, applies `shortCloseTotals`, overshipAmount 0, paymentState recomputed, event `ORDER_SHORT_CLOSED` {reason, before, after}. `record_payment` (`payment.record`): ceiling check inside the lock via `paymentCeilingProblem`. `confirm_payment` (`payment.confirm`): lock + re-read. `record_refund` (`payment.confirm`): `refundProblem(refundDue, amount)`; creates CONFIRMED payment `amount: −x`, recompute confirmedPaid/paymentState, event `REFUND_RECORDED`. GET returns computed `quantities`, `unpaidOverload`, `refundDue`, `createdBy {id,name}`.

- [ ] **Step 1: Failing tests** — `close short re-bills and can create refund owed` (paid 3 000 000, new total 2 730 000 → refundDue 270 000); deliver refused when not loaded and not short; cancel refused with loads; X→X refused; refund over due refused.
- [ ] **Step 2–4:** FAIL → implement → PASS + tsc.
- [ ] **Step 5: Commit** `Feat(gazoblok) · strict deliver, close short, guarded cancel, locked payments, refunds`.

### Task 5: Permissions like beam-and-block

**Files:** Create `src/lib/gazoblok-permissions.ts` (`GAZOBLOK_ACTION_PERMISSION` map + `canSeeGazoblokOrder(user, order)`); Modify every route under `src/app/api/gazoblok/**` (`withAuth` → `withPermission`/in-handler `can`), `src/lib/page-auth.ts` (`/gazoblok/orders` → `order.view`, `/gazoblok/new` → `order.create`, `/gazoblok/stock` & `/gazoblok/production` → `inventory.view`, `/gazoblok/catalog` → `pricing.edit`), `src/components/sidebar.tsx` (same keys), orders list API (filter `createdById = me` without `order.viewAll`; legacy null createdById visible only with viewAll), POST orders sets `createdById`; Create `scripts/gazoblok-access-report.ts` (users who used gazoblok in the last 90 days per events/payments/movements and which new keys they lack); Test `tests/gazoblok-permissions.test.ts`.

- [ ] **Step 1: Failing tests** — map values equal spec §4.7; `canSeeGazoblokOrder` own vs others vs viewAll vs legacy null.
- [ ] **Step 2–4:** FAIL → implement → PASS + tsc; grep shows no `withAuth` left in `src/app/api/gazoblok` except comments/config GET if read-only for any user (ruling if kept).
- [ ] **Step 5: Commit** `Feat(gazoblok) · permissions like beam-and-block`.

### Task 6: No silent client rename; decimal comma

**Files:** Modify `src/app/api/gazoblok/orders/route.ts` (+ validation field `clientNameDecision: "keep" | "update"` optional), `src/app/(app)/gazoblok/new/page.tsx` (dialog on 409 `CLIENT_NAME_MISMATCH` showing saved vs typed name: «Сақланган номни қолдириш» / «Номни янгилаш»), `src/components/gazoblok/GazoblokWallCalculator.tsx` (all length/area inputs through `parseDecimal`); Test extend `tests/gazoblok-quantities.test.ts` (`clientNamePlan(existing: string, typed: string, decision?): "same" | "ask" | "keep" | "update"`).

- [ ] **Steps:** failing test → FAIL → implement → PASS + tsc → commit `Fix(gazoblok) · ask before renaming a client; accept decimal comma`.

### Task 7: One quote rule + small audit fixes

**Files:** Modify `src/lib/agent/gazoblok-quote.ts`, `src/lib/mcp/quote/gazoblok.ts` (use `estimateProject` with the CRM calculator's defaults; drop `isYangiqorgon` / `delivery_included`), `src/lib/mcp/quote/texts.ts` (delivery line: «Yetkazib berish operator bilan kelishiladi» / RU / EN equivalents; customer texts stay in their existing script), `src/lib/agent/tools/get-gazoblok-quote.ts` (weight from `gazoblok-weight.ts`), `src/app/api/gazoblok/orders/route.ts` (`active: true`), `shipments/route.ts` (retry once on P2002), `shipments/[sid]/route.ts` (guarded `updateMany` status LOADED→DELIVERED), `src/lib/gazoblok-validation.ts` (normalise upload URLs, reject `..`); Test `tests/gazoblok-quote-parity.test.ts` (AI quote blocks = CRM `estimateProject` blocks for 30 m² and 100,2 m² of 600×300×200, waste 5 %; `..` URL rejected) + update existing MCP/agent gazoblok tests whose numbers change (ledger each).

- [ ] **Steps:** failing test → FAIL → implement → PASS full suite + tsc → commit `Fix(gazoblok) · one quote rule for CRM, agent and MCP; audit fixes`.

### Task 8: Order screen — quantities, debt, refund, dialogs, history

**Files:** Modify `src/app/(app)/gazoblok/orders/[id]/page.tsx`, `src/components/gazoblok/GazoblokShipmentsSection.tsx` (send `confirmOverload` after the confirm dialog), `src/app/(app)/gazoblok/orders/page.tsx` (flags: «Ортиқча юклама», «Қайтариш керак», no "awaiting payment" on CANCELED); Create `src/components/gazoblok/GazoblokQuantitiesTable.tsx`, `GazoblokDebtPanel.tsx` (over-load debt + selling operator; refund owed + record refund for `payment.confirm`), `GazoblokCloseShortDialog.tsx`, `GazoblokOverloadConfirmDialog.tsx`, `GazoblokHistory.tsx` («Ким · нима · dd.mm.yyyy HH:mm», Uzbek event labels map).

Copy (exact): table headers «Ўлчам · Буюртма · Юкланди · Қолди · Ортиқча»; debt «Ортиқча юклама: +N та · +X UZS · тўланмаган Y UZS · Сотувчи: {name}»; over confirm «Буюртмадан ортиқ: +N та · +X UZS. Мижоз қарзи шунча ошади.»; close short title «Қолганини олмайди — буюртмани ёпиш»; cancel only when nothing loaded, button «Буюртмани бекор қилиш» (delivery dialog close button «Ёпиш», never «Бекор қилиш»).

- [ ] **Step 1:** implement components using design comps from `C:\Users\aziz\Downloads\gazoblok-visual\` if ready, else existing patterns.
- [ ] **Step 2:** tsc + full suite.
- [ ] **Step 3:** browser check on `precast_crm_gazoblok_reno` (fake data): place order, load over (confirm dialog), correct load, close short, refund, cancel blocked after load, history rows; screenshots light/dark 1440/412 → `docs/screenshots/gazoblok-stage1/`.
- [ ] **Step 4: Commit** `Feat(gazoblok) · order screen shows ordered/loaded/left, debt, refunds, history`.

### Task 9: Owner gate

- [ ] `npm run build`, `npx tsc --noEmit`, `npx vitest run`; whole-branch fresh review; fix Critical/Important with tests; screenshots + access report + reconcile dry-run instructions to the owner. Stop: deploy only on "deploy".
