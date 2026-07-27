# Gazoblok Tab — Engineering Audit

**Date:** 2026-07-21
**Method:** 4 parallel independent reviews — orders-flow UX, catalog/stock/production UX, backend correctness/security, and architectural consistency vs the core precast flow. Every finding cites verified `file:line` evidence. Findings flagged by 2+ independent reviewers are marked **[×2]** / **[×3]**.

---

## Executive verdict

Gazoblok is a well-built sibling at the **data layer** (shared Client, shared Comment/receipt/enum infrastructure, composed order numbering, transactional append-only stock ledger, server-authoritative pricing with snapshot prices) — but a **drifting fork at the money-control layer**, and its frontend **trusts the happy path** far too much. Three systemic themes account for most findings:

1. **Gazoblok money operates outside every control the core flow enforces** — invisible to the dashboard, receivables, the payments confirmation queue, and notifications.
2. **Every stock/status-mutating path has a check-then-act race** — no row locking or conditional updates.
3. **Failures are silent** — errors render as empty states, failed writes clear the operator's input, warnings the ledger was designed to emit are discarded.

---

## THEME 1 — Money outside the control system (highest business risk)

### 1.1 Gazoblok money is invisible to every financial surface — CRITICAL
- `src/lib/dashboard-data.ts:131-273` — all 17 revenue/receivables aggregates read `prisma.order` only; zero `gazoblokOrder`.
- `src/app/api/payments/route.ts:20-71` — the `/payments` confirmer queue reads only `Payment`, never `GazoblokPayment`.
- `src/app/api/gazoblok/orders/[id]/route.ts:119-161` — record_payment emits **no notification**; confirmation UI exists only inside the single order page.
- **Impact:** a pending gazoblok payment stalls forever unless the owner reopens that exact order; delivered-with-debt gazoblok orders are receivables tracked in no report. Untracked qarzdorlik in a CRM whose core concern is qarzdorlik.
- **Fix:** route `GazoblokPayment` through the shared payments domain — union it into the `/api/payments` queue (with a `system` discriminator, as `operator-photo-dm.ts` already does), add a gazoblok line to `dashboard-data.ts`, wire the confirmer notification. **This one unification also resolves 1.2–1.4.**

### 1.2 No remaining-balance ceiling on payment recording — CRITICAL [×2]
- `src/lib/gazoblok-validation.ts:70` — `amount: z.number().positive()` is the only constraint; `[id]/route.ts:119-161` never compares to `totalPrice − confirmedPaid − pendingSum`.
- Core has exactly this guard: `src/app/api/payments/route.ts:121-132`.
- **Impact:** double-record the same cash, or confirm 120M on a 12M order → `FULLY_PAID` with 108M unaccounted. Payments can also be recorded on CANCELED orders (guard at `:64-66` covers only `set_status`).
- **Fix:** extract `remainingBalance()` from `src/lib/payment-state.ts:30-37`, enforce at record AND re-check inside the confirm transaction; reject payments on CANCELED orders.

### 1.3 Owner auto-confirm missing — IMPORTANT
- `[id]/route.ts:120-130` + `orders/route.ts:167-177` — every payment lands PENDING_CONFIRMATION even when recorded by a `payment.confirm` holder. Core: `src/app/api/payments/route.ts:134-145,189-220`.
- **Fix:** port the ~30-line `autoConfirm` branch; the maker-checker rule must be identical across product lines.

### 1.4 Fourth divergent copy of the payment-state formula; no write-off — IMPORTANT
- `[id]/route.ts:16-22` — local `recomputePaymentState`, `1e-6` epsilon, no `writeOffAmount`, no `totalPrice > 0` guard. Canonical: `src/lib/payment-state.ts:14-23` (which calls itself "single source of truth"; there are 2 more inline copies in core).
- No `writeOffAmount` column on `GazoblokOrder` and no settle-remaining endpoint → small remainders stay PARTIALLY_PAID forever.
- **Fix:** call `paymentStateFor()` with `writeOffAmount=0`; decide deliberately whether gazoblok needs settle-remaining.

### 1.5 Up-front payment silently dropped — IMPORTANT
- `orders/route.ts:168` — `if (paidAmount > 0 && body.paymentMethod)`: a request with `paidAmount: 5_000_000` and no method creates the order and records **no payment**, no error.
- **Fix:** Zod `.refine(b => b.paidAmount === 0 || !!b.paymentMethod)` → 422.

---

## THEME 2 — Concurrency races on stock & status (highest data-corruption risk)

### 2.1 TOCTOU on status change → double stock decrement — CRITICAL
- `src/app/api/gazoblok/orders/[id]/route.ts:56-59` (unlocked read), `:79` (guard on stale status), `:95` (unconditional update).
- **Scenario:** two operators click "Delivered" in the same second → both pass the guard → stock decremented twice (−1000 for a 500-block order), two SALE ledger rows. DELIVER racing CANCEL can decrement stock on an order that ends CANCELED, never restocked.
- **Fix:** conditional `updateMany({ where: { id, status: order.status } })` inside the transaction; 409 when `count === 0`.

### 2.2 Shipment over-load guard non-atomic → oversell — IMPORTANT
- `shipments/[sid]/load/route.ts:47-67` — the "this + other shipments ≤ order totals" check runs *outside* any transaction, separated from the write by photo I/O (`:73-76`).
- **Scenario:** two dispatchers load the same 300-block line concurrently → 600 recorded loaded. Route also never checks `order.status` — shipments on CANCELED orders remain loadable.
- **Fix:** move sum-and-check inside `$transaction` with the order row locked; reject CANCELED/DELIVERED orders.

### 2.3 Double-confirm race — MINOR
- `[id]/route.ts:170-176` — PENDING check outside the tx, unconditional update at `:179-189`. Duplicate PAYMENT_CONFIRMED events (totals stay correct via re-aggregation). Fix with the same conditional-updateMany pattern.

### 2.4 Order-number allocation race → raw 409 — MINOR
- `orders/route.ts:123-128` — max-read without lock; unique constraint backstops but the loser sees "Unique constraint violation: orderNumber". Retry once on P2002.

---

## THEME 3 — Silent failures & dishonest UI states

### 3.1 Fetch errors render as healthy empty states — CRITICAL [×2]
- Orders list `gazoblok/orders/page.tsx:61,149-150` — `isError` never read; network failure shows «Буюртма йўқ».
- Catalog `gazoblok/catalog/page.tsx:192-198,292-295` — error shows «Ҳозирча ўлчамлар йўқ» — indistinguishable from the legitimately-empty prod catalog; operator may re-create the whole catalog.
- Order detail `[id]/page.tsx:195-197` — error = infinite «Юкланмоқда…».
- **Fix:** `isError` branch with bilingual message + retry on all three (stock page already does this correctly at `stock/page.tsx:101-104` — copy it).

### 3.2 Stock adjustment fails silently AND destroys input — CRITICAL
- `gazoblok/stock/page.tsx:49-67` (no `onError`, `isError` never rendered) + `:176-181` (inputs cleared before the request resolves).
- **Impact:** warehouse operator on flaky connection believes the correction landed; live inventory silently stays wrong.
- **Fix:** clear inputs in `onSuccess` only; render bilingual error on failure.

### 3.3 Production save silently drops half-filled lines — CRITICAL
- `gazoblok/production/page.tsx:93-95,104-107,120` — a line with size but blank qty is discarded without warning; stock understated with no trace.
- **Fix:** block Save while any line is partially filled; red-outline invalid lines.

### 3.4 Oversell warnings computed then thrown away — IMPORTANT [×2]
- `[id]/route.ts:85` ignores the return of `decrementGazoblokForOrder`; `gazoblok-stock.ts:9-10` documents "callers surface the returned warnings". Stock page likewise ignores `resultingQuantity` (`stock/route.ts:39` vs `stock/page.tsx:49-67`).
- **Fix:** return warnings in the response; UI shows «Омборда етарли эмас».

### 3.5 Cache invalidation gaps — IMPORTANT [×2]
- Detail mutations invalidate only `["gazoblok-order", id]` (`[id]/page.tsx:130-132`) — never the orders list or stock keys; DELIVERED decrements stock server-side but the stock page shows stale numbers for 30s.
- Catalog mutations never invalidate `["gazoblok","stock"]` (`catalog/page.tsx:144-158`) — disabled sizes still look active on the stock page.
- **Fix:** invalidate all affected keys per mutation.

### 3.6 Catalog row save wipes other rows' unsaved edits — IMPORTANT
- `catalog/page.tsx:133-139` — effect rebuilds ALL drafts from server data on every refetch; saving row A resets row B's dirty edits. Merge only into non-dirty rows.

### 3.7 Server validation errors surface as English "Validation failed" — IMPORTANT
- `src/lib/api.ts:33-35` flattens ZodError but `src/lib/fetcher.ts:19-22` discards `details`. E.g. typed decimal in production qty → bare "Validation failed", no field info. Fix: bilingual generic + field hints; tighten client validation to mirror zod integers.

---

## THEME 4 — State-machine gaps

### 4.1 LOADED shipment permanently stuck after order-level DELIVERED — CRITICAL
- `GazoblokShipmentsSection.tsx:120,162-199` — all shipment actions hidden once order is DELIVERED; `[id]/page.tsx:377-391` — order-level «Етказилди» works independently of shipment state. Two parallel delivery models that permanently disagree.
- **Fix:** derive/auto-complete open shipments on order DELIVERED (with consequence stated in the confirm), or block the order-level button while shipments are PENDING/LOADED.

### 4.2 Cancel/DELIVERED semantics diverge from core — IMPORTANT
- Cancel: any authenticated user via `set_status` + `window.prompt`; core requires `order.cancel` + cancel password (`orders/[id]/cancel/route.ts:14-47`).
- DELIVERED allowed with outstanding balance (core blocks until balance 0); combined with 1.1 that debt is invisible.
- Restock-on-cancel at `[id]/route.ts:90-92` is **unreachable dead code** (DELIVERED is terminal per `:70-72`).
- **Fix:** owner decision on delivered-with-debt (may be legitimate for commodity sales — but then 1.1 must land); gate cancel; delete or make reachable the restock branch.

### 4.3 PENDING (never-loaded) shipment can be marked DELIVERED — MINOR
- `shipments/[sid]/route.ts:18` — only DELIVERED is rejected. Require LOADED→DELIVERED; reject on CANCELED orders.

### 4.4 Production entries irreversible — IMPORTANT
- `production/route.ts` has no void/correction path; a +1000 typo is fixable only via a stock adjustment on another page, leaving history permanently wrong. Fix: void action posting a linked reversing movement.

---

## THEME 5 — Authorization & security

### 5.1 Phantom permissions in doc comments; price editing open to all — IMPORTANT [×3]
- All gazoblok routes use `withAuth` while comments claim `gazoblok.view`/`gazoblok.manage`/`gazoblok.production` — none exist in `src/lib/permissions.ts` (zero grep hits).
- Catalog price mutation open to any logged-in user; core pricing requires `pricing.edit` (`src/app/api/pricing/route.ts:53-54`). Order lines snapshot `pricePerBlock` at placement — any operator can lower a price, place an order, restore it (audited but unprevented).
- **Fix:** gate catalog/config mutations behind existing `pricing.edit` (no new permission needed) or get explicit owner sign-off; fix the misleading comments either way.

### 5.2 `receiptUrls`/`deliveryProofUrl` accept arbitrary strings — IMPORTANT
- `gazoblok-validation.ts:66,73` — no prefix validation; any logged-in user can attach `https://attacker.example/pixel.png` (IP/UA leak to every viewer) or a guessed private inbox media path (laundered into visibility).
- **Fix:** validate against the exact `/uploads/receipts/gazoblok/...` prefix the uploader mints.

### 5.3 Receipts publicly served — IMPORTANT (known B2 gap, priority raised)
- Bank-transfer receipts and loading photos land in `/uploads`, served publicly by Caddy. Any leaked URL exposes payment documents permanently. The already-tracked fix (auth-gated serving) should be scheduled.

---

## THEME 6 — UX / i18n / design-system drift (batch-fixable)

| # | Finding | Evidence |
|---|---|---|
| 6.1 | Raw English enums in UI: `BANK_TRANSFER` in payments table & select (NEW page already translates them) | `[id]/page.tsx:435,521-527` |
| 6.2 | Activity log prints munged English event types; also no actor shown (core includes actor) | `[id]/page.tsx:575`; API `:37` vs core `orders/[id]/route.ts:48-52` |
| 6.3 | `window.confirm`/`window.prompt` for cancel/deliver/reject — browser-language buttons, no theme, one-line reason | `[id]/page.tsx:175,177,480` |
| 6.4 | Shipment status colors hard-coded light-only (`bg-amber-50` etc.) — broken in dark mode; bypasses `Chip` (faithful copy of core's own violation) | `GazoblokShipmentsSection.tsx:38-42` |
| 6.5 | English "Failed" fallback errors; raw `fetch` instead of `api()`/mutations in shipments layer | `GazoblokShipmentsSection.tsx:69-106`, modal `:129-133` |
| 6.6 | Shipment delete: icon-only, instant, no confirmation, no aria-label | `GazoblokShipmentsSection.tsx:174-184` |
| 6.7 | Split-shipment modal: no role/focus-trap/Escape; unlabeled inputs; body scroll not locked | `GazoblokSplitShipmentModal.tsx:140-141,180-219,273-286` |
| 6.8 | Search fires per keystroke, table blanks while typing (no debounce, no `keepPreviousData`) | `gazoblok/orders/page.tsx:61-70,147-148` |
| 6.9 | New-order page dead-ends silently if catalog fetch fails or is empty | `new/page.tsx:80-87,356-363` |
| 6.10 | «Қаторга қўшиш» non-idempotent, zero feedback — double-click silently doubles quantities | `new/page.tsx:171-195,556-564` |
| 6.11 | Sub-44px touch targets throughout warehouse-floor pages (32px inputs, 28px buttons) | `stock/page.tsx:199-222`, `production/page.tsx:222-230`, list `:132` |
| 6.12 | Catalog: 7-column inline-edit table unusable on mobile; «Ўчириш» label on a disable action; no duplicate-size guard; hidden threshold default 50 | `catalog/page.tsx:297-499,465-476,180` |
| 6.13 | Truck-capacity inputs snap to defaults mid-edit (`parseInt(...) \|\| 10000`) | modal `:185,195,215` |
| 6.14 | Float boolean gate on payment UI (`Number(a) − Number(b) > 0`) — epsilon-vulnerable | `[id]/page.tsx:201-224` |
| 6.15 | Production history silently capped at 50 with no note; production date capped client-side only | `production/route.ts:15`; validation `:84-88` |
| 6.16 | Minor: object-URL leak in photo previews; stale error banner on confirm; Enter doesn't submit add-line; inline `toLocaleString` vs shared `formatNumber`; English `alt` texts | modal `:85`; `[id]/page.tsx:469`; `new/page.tsx:349-387` |

---

## What's done well (verified, for calibration)

- Transactional append-only stock ledger with audit records; production mutation invalidates all three caches correctly.
- Server-authoritative totals; snapshot pricing; `round2/round3` everywhere; correct space-thousands `formatNumber` with `tabular-nums`.
- Shared Client with phone-normalized dedup; `CommentThread`/`ReceiptPicker` extended, not forked; numbering composed (`B-YYYY-MM-NNNN`, zero collision risk).
- Weight math correct vs the 611 kg/m³ rule (22 kg/block). Upload route validates MIME + magic bytes + size, no path traversal. Confirm-payment checks cross-order ownership.
- Wire contract consistent (Decimal-as-string documented and handled).
- Sidebar IA deliberately mirrors core (orders / operations / settings). Stock page has proper loading/error/empty branches — the model the other pages should copy.

---

## Recommended fix waves

**Wave 1 — Money control (1-2 days):** unify `GazoblokPayment` into the shared payments domain (queue + notifications + dashboard + `paymentStateFor()` + balance ceiling + auto-confirm + refine on paidAmount/method). Resolves 1.1–1.5 in one coherent change.

**Wave 2 — Concurrency (half day, small diff):** conditional `updateMany` guards on status change, shipment load (moved inside tx + order-status check), payment confirm; surface oversell warnings; P2002 retry.

**Wave 3 — Honest UI (1 day):** error/empty branches on list/detail/catalog/new; stock-adjust and production-save input protection; cache invalidations; bilingual error fallbacks; catalog dirty-row preservation.

**Wave 4 — State machine (half day, needs 2 owner decisions):** shipment/order delivery reconciliation; cancel gating; delivered-with-debt rule; PENDING→DELIVERED block; production void.

**Wave 5 — Design-system batch (1 day):** Chip tokens, enum label maps, in-app dialogs replacing window.confirm/prompt, modal a11y, touch targets, debounced search, mobile catalog cards.

**Owner decisions needed before Wave 4:** (a) may a gazoblok order be DELIVERED with outstanding debt? (b) should catalog price editing require `pricing.edit`? (c) is gazoblok revenue meant to appear in the dashboard (recommended: yes, as a separate line)?
