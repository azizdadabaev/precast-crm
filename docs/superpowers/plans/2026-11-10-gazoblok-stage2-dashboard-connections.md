# Gazoblok Stage 2 — Dashboard and Connections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give gazoblok its own dashboard (revenue, receivables, over-load debt per selling operator, stock, trucks, 7-day plan) and connect it to the payments queue, the bell, the client page and the Excel backup.

**Architecture:** Pure math in `src/lib/gazoblok-dashboard.ts` (unit-tested), Prisma reads in `src/lib/gazoblok-dashboard-data.ts`, one read-only API per surface. The only schema change is one additive nullable column (`Notification.gazoblokOrderId`). Tasks 1–3 lay the shared foundation in sequence; Tasks 4–8 touch disjoint files and run in parallel; Task 9 verifies.

**Tech Stack:** Next 14 App Router, TypeScript strict, Prisma (`db push`, no migrations folder), zod, vitest (node env, `tests/**/*.test.ts`), react-query, Tailwind HSL tokens, `src/components/ui/*`, `useT(uz,en)` / `<Bi>`.

**Spec:** `docs/superpowers/specs/2026-11-10-gazoblok-stage2-design.md` (§ numbers below refer to it). Parent spec: `docs/superpowers/specs/2026-11-10-gazoblok-renovation-design.md`. Visual: `C:\Users\aziz\Downloads\gazoblok-visual\direction.md`, `comps/06-dashboard.html`.

Paths are relative to `precast-crm/` in worktree `.claude/worktrees/gazoblok-reno` (branch `feat/gazoblok-renovation`). Test command prefix: `cd precast-crm && npx vitest run <file>`.

## Global Constraints

- UI strings Uzbek Cyrillic via `useT(uz,en)`/`<Bi>`; exact copy from spec §5–§7. API errors keep `"Узбекча · English"`. Click/Payme stay Latin.
- Figures: `formatNumber` (space thousands, decimal comma), mono `font-[var(--font-num)]` + `tabular-nums`, money right-aligned, unit `UZS` / `та` / `кг` / `м³`.
- Colours only from existing tokens: paid `--success`, partial `--primary`, awaiting payment muted (`--muted-foreground`), unconfirmed payment `--warning` chip «Тасдиқланмаган», over-load debt `--destructive`. No hex, no gradients, no coloured left stripes, no emoji. Light + dark.
- Controls ≥ 44 px; no sideways scroll at 412 px.
- Money: `Number(Decimal)` + `round2` (codebase convention); no writes to orders, payments or stock anywhere in Stage 2.
- Permissions per spec §3, existing keys only. Money on the gazoblok dashboard requires `dashboard.view`, stripped server-side.
- Beam-and-block dashboard, `/api/payments`, `/api/orders/capacity`, ledger and `openapi` registry are NOT modified.
- Schema change: only `Notification.gazoblokOrderId String?` + index; local DB `precast_crm_gazoblok_reno` only (`npx prisma db push`); prod at deploy with the owner.
- No push / deploy until the owner says "deploy"; screenshots first.

## Review Focus

1. **viewBasic user calls `/api/gazoblok/dashboard` directly** — response has `money: null`, never the figures. → Task 3 test `viewBasic gets no money`.
2. **Legacy order with `createdById = null` and unpaid over-load** — appears under the «Номаълум (эски буюртма)» row, not dropped. → Task 2 test `groups legacy orders under null operator`.
3. **Order partly paid so unpaid < over-load amount** — row shows `min(overshipAmount, total − paid)`; fully paid → no row. → Task 2 test `unpaid over-load is the last money in`.
4. **Bell click on a gazoblok notification** — opens `/gazoblok/orders/{id}`, never `/orders/{gazoblokId}` (404). → Task 1 test `targetUrl prefers gazoblokOrderId` + Task 5 test `notices never set orderId`.
5. **Short-closed open order** — reserves no stock (its remainder was released) and its plan row shows 0 left. → Task 2 test `short-closed orders reserve nothing`.

---

### Task 1: Notification link column (sequential)

**Files:**
- Modify: `prisma/schema.prisma` (`model Notification`: `gazoblokOrderId String?` after `conversationId`, `@@index([gazoblokOrderId])`)
- Modify: `src/lib/notifications.ts` (`CreateNotificationInput.gazoblokOrderId?: string | null`; persist; add to SSE JSON; add to push data as `gazoblokOrderId: row.gazoblokOrderId ?? ""`)
- Modify: `src/hooks/useNotifications.ts` (`NotificationItem.gazoblokOrderId: string | null`)
- Modify: `src/components/notifications/notification-meta.ts` (`targetUrl`: first line `if (n.gazoblokOrderId) return \`/gazoblok/orders/${n.gazoblokOrderId}\`;`)
- Test: `tests/gazoblok-notification-link.test.ts`

**Interfaces — Produces:** `emitNotifications({ ..., gazoblokOrderId })`; `NotificationItem.gazoblokOrderId`.

- [ ] **Step 1: Failing test** — `targetUrl prefers gazoblokOrderId`: item `{ gazoblokOrderId: "g1", orderId: null, paymentId: "p1", ... }` → `"/gazoblok/orders/g1"`; item with only `orderId: "o1"` → `"/orders/o1"` (unchanged).
- [ ] **Step 2: Run** `npx vitest run tests/gazoblok-notification-link.test.ts` — FAIL (property missing / wrong URL).
- [ ] **Step 3: Implement** the four edits; `npx prisma db push` against the worktree `.env` (`precast_crm_gazoblok_reno`) — do NOT run `prisma format` (re-aligns unrelated lines; Stage 1 ruling).
- [ ] **Step 4: Run** test + `npx tsc --noEmit` — PASS, 0 errors.
- [ ] **Step 5: Commit** `git add prisma/schema.prisma src/lib/notifications.ts src/hooks/useNotifications.ts src/components/notifications/notification-meta.ts tests/gazoblok-notification-link.test.ts` → `Feat(gazoblok) · notifications can link to a gazoblok order`.

### Task 2: Pure dashboard math (sequential)

**Files:** Create `src/lib/gazoblok-dashboard.ts`; Test `tests/gazoblok-dashboard.test.ts`

**Interfaces — Consumes:** `lineQuantities`, `unpaidOverload` (`src/lib/gazoblok-quantities.ts`); `monthWindow`, `monthKey`, `dayKey` (`src/lib/dashboard-metrics.ts`); `blockWeightKg`, `loadWeightKg`, `type GazoblokLine` (`src/lib/gazoblok-weight.ts`); `round2`.
**Produces** (all exported, all pure, `now: Date` passed in):
```ts
export type GazoblokMonth = { key: string; label: string; year: number; booked: number; orders: number;
  blocks: number; volumeM3: number; collected: number };
export type OverloadOperator = { operatorId: string | null; name: string | null; extraBlocks: number; unpaid: number;
  orders: { id: string; orderNumber: string; clientName: string; extraBlocks: number; unpaid: number }[] };
export type GazoblokOverload = { total: number; extraBlocks: number; orders: number; operators: OverloadOperator[] };
export type StockRow = { productId: string; label: string; onHand: number; reserved: number; free: number;
  state: "ok" | "low" | "out" };
export type TruckRow = { shipmentId: string; orderId: string; orderNumber: string; clientName: string; number: number;
  status: "PENDING" | "LOADED" | "DELIVERED"; blocks: number; weightKg: number; overBlocks: number; at: string | null };
export type PlanDay = { date: string; orders: { id: string; orderNumber: string; clientName: string; blocksLeft: number }[] };
export type GazoblokDashboard = { generatedAt: string;
  money: null | { months: GazoblokMonth[]; receivables: { total: number; orders: number };
    unconfirmed: { total: number; count: number }; overload: GazoblokOverload };
  stock: StockRow[]; trucks: TruckRow[]; plan: PlanDay[]; unscheduledOpen: number };

type DimLine = { id: string; productId: string | null; productLabel: string; quantity: number;
  product: { lengthM: number; heightM: number; thicknessM: number } | null };
type DashShipment = { id: string; number: number; status: "PENDING" | "LOADED" | "DELIVERED"; loadedLines: unknown;
  loadedAt: Date | null; deliveredAt: Date | null };
export type MoneyOrderRow = { id: string; orderNumber: string; totalPrice: number; confirmedPaid: number;
  overshipAmount: number; createdById: string | null; createdByName: string | null; clientName: string;
  lines: { id: string; productId: string | null; productLabel: string; quantity: number }[];
  shipments: { loadedLines: unknown }[] };
export type OpenOrderRow = { id: string; orderNumber: string; clientName: string; scheduledAt: Date | null;
  shortClosedAt: Date | null; lines: DimLine[]; shipments: DashShipment[] };

export function monthlySeries(now: Date, orders: { placedAt: Date; totalPrice: number; totalBlocks: number; totalVolumeM3: number }[],
  payments: { amount: number; confirmedAt: Date | null }[]): GazoblokMonth[];
export function receivablesOf(rows: { totalPrice: number; confirmedPaid: number }[]): { total: number; orders: number };
export function overloadByOperator(rows: MoneyOrderRow[]): GazoblokOverload;
export function stockRows(products: { id: string; label: string; lowStockThreshold: number; onHand: number }[],
  open: OpenOrderRow[]): StockRow[];
export function truckRows(open: OpenOrderRow[], deliveredToday: OpenOrderRow[]): TruckRow[];
export function dayPlan(now: Date, open: OpenOrderRow[], days?: number /* 7 */): { plan: PlanDay[]; unscheduledOpen: number };
export function clientGazoblokSummary(rows: { status: string; totalPrice: number; confirmedPaid: number }[]):
  { orderCount: number; totalBooked: number; debt: number };
```
Rules exactly as spec §4 "Rules" and §7 (weight per block = `blockWeightKg(dims)`, 0 when `product` is null; `deliveredToday` rows carry only the shipments delivered today).

- [ ] **Step 1: Failing tests** (fixture: now = 2026-11-10 12:00 local; lines A 200 × 18 000, B 100 × 20 000):
  - `monthlySeries` returns 12 months, last key `"2026-11"`; an order placed 2026-11-03 total 5 000 000 / 300 blocks / 9,72 m³ and one placed 2025-10-31 (outside) → Nov `booked 5000000, orders 1, blocks 300`; payments 3 000 000 confirmed 2026-11-05 and refund −500 000 confirmed 2026-11-07 → Nov `collected 2500000`; payment with `confirmedAt null` ignored.
  - `receivablesOf([{5e6,3e6},{1e6,1e6},{2e6,2.5e6}])` → `{ total: 2000000, orders: 1 }` (overpaid counts 0).
  - `unpaid over-load is the last money in`: order total 5 000 000, overship 900 000, paid 4 500 000 → unpaid 500 000; paid 5 000 000 → no row.
  - `groups legacy orders under null operator`: two orders by `u1` ("Тест Оператор") + one with `createdById null` → operators `[u1 (sum), null]` sorted by unpaid desc; `extraBlocks` = Σ `over` from shipments (A loaded 232 of 200 → 32); totals `{ total, extraBlocks, orders: 3 }`.
  - `stockRows`: onHand 1240, open order A left 432 → `{ reserved: 432, free: 808, state: "ok" }`; onHand 180, reserved 150, threshold 50 → free 30 `"low"`; onHand 0 → `"out"`; free never negative.
  - `short-closed orders reserve nothing`: same open order with `shortClosedAt` set → reserved 0; `dayPlan` row `blocksLeft 0`.
  - `truckRows`: LOADED (loadedAt 08:50), PENDING, DELIVERED-today (07:40) → order `[LOADED, PENDING, DELIVERED]`; LOADED row `blocks 140`, `weightKg` = 140 × `blockWeightKg(0.6,0.3,0.2)` rounded to whole kg; `overBlocks` 32 for the over-loaded order.
  - `dayPlan`: orders scheduled today, today+6, today+7, null → plan has 2 days (`"2026-11-10"`, `"2026-11-16"`), `unscheduledOpen: 1`.
  - `clientGazoblokSummary`: PLACED 5e6/3e6, CANCELED 1e6/0, DELIVERED 2e6/2e6 → `{ orderCount: 3, totalBooked: 7000000, debt: 2000000 }`.
- [ ] **Step 2: Run** `npx vitest run tests/gazoblok-dashboard.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement** `src/lib/gazoblok-dashboard.ts`.
- [ ] **Step 4: Run** test + `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** `git add src/lib/gazoblok-dashboard.ts tests/gazoblok-dashboard.test.ts` → `Feat(gazoblok) · dashboard math: revenue, debts, over-load per operator, stock, trucks`.

### Task 3: Dashboard data + API + page rule (sequential)

**Files:**
- Create: `src/lib/gazoblok-dashboard-data.ts`, `src/app/api/gazoblok/dashboard/route.ts`
- Modify: `src/lib/page-auth.ts` (add `"/gazoblok/dashboard": ["dashboard.view", "dashboard.viewBasic"]` after `...GAZOBLOK_PAGE_RULES`)
- Test: extend `tests/gazoblok-permissions.test.ts`; add `tests/gazoblok-dashboard-api.test.ts`

**Interfaces — Consumes:** Task 2 functions/types; `withPermissionAny` (`src/lib/api-auth.ts`); `can`.
**Produces:**
- `fetchGazoblokDashboard(now: Date): Promise<GazoblokDashboard>` — the 7 queries of spec §4 in one `Promise.all`, Decimals → `Number`, maps rows to Task 2 inputs.
- `forViewer(d: GazoblokDashboard, user: PermissionSubject): GazoblokDashboard` — returns `{ ...d, money: null }` unless `can(user, "dashboard.view")`.
- `GET /api/gazoblok/dashboard` = `withPermissionAny(["dashboard.view","dashboard.viewBasic"], async (_req, { user }) => ok(forViewer(await fetchGazoblokDashboard(new Date()), user)))`; DB errors fall to the wrapper's 500 (existing pattern).

- [ ] **Step 1: Failing tests** — `ruleForPath("/gazoblok/dashboard")` equals `["dashboard.view","dashboard.viewBasic"]`; `ruleForPath("/gazoblok/orders/x")` still `"order.view"`; `viewBasic gets no money`: `forViewer(fixture, { isActive: true, permissions: ["dashboard.viewBasic"] })` → `money === null`, `stock` unchanged; with `["dashboard.view"]` → `money` deep-equals fixture; inactive user with `dashboard.view` → `money === null`.
- [ ] **Step 2: Run** both test files — FAIL.
- [ ] **Step 3: Implement** data lib, route, page rule. (`forViewer` lives in `gazoblok-dashboard-data.ts` next to the fetcher, imports no Prisma at module top beyond `@/lib/prisma`; if the test import pulls Prisma, put `forViewer` in `gazoblok-dashboard.ts` instead and say so in the ledger.)
- [ ] **Step 4: Run** tests + `npx tsc --noEmit` — PASS. Smoke: dev server on 3106, `curl` with an owner session cookie → 200 JSON with `money.months.length === 12`.
- [ ] **Step 5: Commit** `git add src/lib/gazoblok-dashboard-data.ts src/app/api/gazoblok/dashboard/route.ts src/lib/page-auth.ts tests/gazoblok-permissions.test.ts tests/gazoblok-dashboard-api.test.ts` → `Feat(gazoblok) · dashboard API with money for dashboard.view only`.

---
Tasks 4–8 share no files and may run at the same time (each builder runs only its own tests + `tsc`; nobody runs `next build` or Gradle before Task 9).

### Task 4: Dashboard page

Parallel group: A

**Files:**
- Create: `src/app/(app)/gazoblok/dashboard/page.tsx`, `src/components/gazoblok/dashboard/GazoblokKpis.tsx`, `GazoblokRevenueChart.tsx`, `GazoblokOverloadTable.tsx`, `GazoblokStockTable.tsx`, `GazoblokTrucks.tsx`, `GazoblokDayPlan.tsx`
- Modify: `src/components/sidebar.tsx` (one item after `/gazoblok/orders`: `href "/gazoblok/dashboard"`, label «Газоблок бошқаруви», permission `["dashboard.view","dashboard.viewBasic"]`, icon as the neighbouring items use)

**Interfaces — Consumes:** `GET /api/gazoblok/dashboard` → `GazoblokDashboard` (Task 2 types, import type-only). Query key `["gazoblok-dashboard"]`, `refetchInterval: 60_000`, `retry: false`.

- [ ] **Step 1:** Build page per spec §5 and `comps/06-dashboard.html` (layout, copy, chip variants). Selected month state lives in the page (default last index); `GazoblokKpis` and the chart read it. When `money === null` render only stock, trucks, plan. Links: orders `/gazoblok/orders/[id]`, stock `/gazoblok/stock`. Months full names for the KPI label: local const «Январь … Декабрь»; axis uses `GazoblokMonth.label`.
- [ ] **Step 2:** `npx tsc --noEmit` — 0 errors; `npx vitest run tests/gazoblok-*.test.ts` — PASS.
- [ ] **Step 3:** Browser on 3106 (`precast_crm_gazoblok_reno`): owner and a `dashboard.viewBasic`-only user; light/dark; 1440/412; empty DB state (no orders) shows the empty texts, no NaN. Screenshots → `docs/screenshots/gazoblok-stage2/dashboard-*.png`.
- [ ] **Step 4: Commit** `git add src/app/(app)/gazoblok/dashboard src/components/gazoblok/dashboard src/components/sidebar.tsx` → `Feat(gazoblok) · own dashboard page`.

### Task 5: Bell notices from gazoblok actions

Parallel group: B

**Files:**
- Create: `src/lib/gazoblok-notify.ts`; Test `tests/gazoblok-notify.test.ts`
- Modify: `src/app/api/gazoblok/orders/route.ts` (after the placement transaction), `src/app/api/gazoblok/orders/[id]/route.ts` (after `record_payment` commit when not auto-confirmed; after `confirm_payment` commit), `src/app/api/gazoblok/orders/[id]/comments/route.ts` (mention: add `gazoblokOrderId: order.id`, drop the "no deep link" comment)

**Interfaces — Consumes:** Task 1 `emitNotifications({ gazoblokOrderId })`, `usersWithPermission`; `PAYMENT_METHOD_LABELS`, `formatNumber`.
**Produces:**
```ts
export type GazoblokNotice = Omit<CreateNotificationInput, "userIds">;
export function placedNotice(o: { id: string; orderNumber: string; clientName: string }): GazoblokNotice;
export function paymentPendingNotice(o: { id: string; orderNumber: string }, p: { id: string; amount: number; method: string }): GazoblokNotice;
export function paymentDecisionNotice(o: { id: string; orderNumber: string }, p: { id: string; amount: number }, approved: boolean): GazoblokNotice;
export function recipients(userIds: string[], actorId: string): string[]; // drops the actor, de-duplicates
```
Titles exactly spec §6 table; amounts `formatNumber(x, 0)`; every notice sets `gazoblokOrderId` and `paymentId` where relevant, never `orderId`.

- [ ] **Step 1: Failing tests** — `placedNotice` title `"Янги газоблок буюртма №B-2026-11-0012 · New gazoblok order #B-2026-11-0012"`, body client name, `type "ORDER_PLACED"`; `paymentPendingNotice` amount 1 500 000 → title contains `formatNumber(1500000, 0)` and `"UZS"`, body `"Click"` for `CLICK`; `paymentDecisionNotice(...,false).type === "PAYMENT_REJECTED"`; `notices never set orderId` (all three: `orderId` undefined, `gazoblokOrderId === o.id`); `recipients(["a","b","a"],"a")` → `["b"]`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** lib; wire routes as fire-and-forget after commit (`void (async () => { ... })()` like `create-order.ts:396`): placed → `payment.confirm` holders; placement with a PENDING initial payment and `record_payment` PENDING → `payment.confirm` holders; confirm/reject → `[payment.recordedById]` when set. Never inside the transaction.
- [ ] **Step 4: Run** test + full `npx vitest run tests/gazoblok-*.test.ts` + `npx tsc --noEmit` — PASS.
- [ ] **Step 5: Commit** the five files → `Feat(gazoblok) · bell notices for new orders and payments`.

### Task 6: Gazoblok payments queue on /payments

Parallel group: C

**Files:**
- Create: `src/app/api/gazoblok/payments/route.ts`, `src/components/gazoblok/GazoblokPaymentsQueue.tsx`, `src/lib/gazoblok-payments-queue.ts`; Test `tests/gazoblok-payments-queue.test.ts`
- Modify: `src/app/(app)/payments/page.tsx` (render `<GazoblokPaymentsQueue canConfirm={...} />` below the beam list; `canConfirm` from the page's existing `me.permissions` includes `payment.confirm`)

**Interfaces — Produces:**
- `parseQueueStatus(v: string | null): "PENDING_CONFIRMATION" | "CONFIRMED" | "REJECTED" | null` — null → default PENDING_CONFIRMATION; unknown → `null` signals 400. (Export a `QUEUE_DEFAULT` const.)
- `queueCounts(groups: { status: string; _count: { _all: number } }[]): { pending: number; confirmed: number; rejected: number }`.
- `GET /api/gazoblok/payments` (`withPermission("payment.view")`) → shape spec §6; 400 «Нотўғри ҳолат · invalid status».
**Consumes:** existing `PATCH /api/gazoblok/orders/[id]` `{ action: "confirm_payment", paymentId, approve, rejectionReason }` (no change to that route).

- [ ] **Step 1: Failing tests** — `parseQueueStatus(null) === "PENDING_CONFIRMATION"`, `"CONFIRMED"` passes, `"DROP"` → `null`; `queueCounts([{status:"CONFIRMED",_count:{_all:3}}])` → `{ pending: 0, confirmed: 3, rejected: 0 }`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** helpers, route, component per spec §6 (pills, rows, reject dialog with «Рад этиш» / «Орқага», buttons only when `canConfirm`; on success invalidate `["gazoblok-payments"]`; on error show the API message). Empty: «Тасдиқланмаган газоблок тўлови йўқ».
- [ ] **Step 4: Run** test + `npx tsc --noEmit` — PASS; browser: record a payment as an operator (pending) → it appears; confirm as owner → moves to «Тасдиқланган», order's paid figure updates; operator without `payment.confirm` sees no buttons. Screenshots → `docs/screenshots/gazoblok-stage2/payments-*.png`.
- [ ] **Step 5: Commit** the five files → `Feat(gazoblok) · gazoblok payments in the payments queue`.

### Task 7: Client page and list

Parallel group: D

**Files:**
- Modify: `src/app/api/clients/[id]/route.ts` (GET: include `gazoblokOrders` 20 newest with the spec §7 select; one extra `gazoblokOrder.findMany({ where: { clientId }, select: { status, totalPrice, confirmedPaid } })` → `clientGazoblokSummary`; return `{ ...client, totalBooked, orderCount, gazoblok }`)
- Modify: `src/app/api/clients/route.ts` (`include._count.select.gazoblokOrders = true`)
- Modify: `src/app/(app)/clients/[id]/page.tsx` (card «Газоблок буюртмалари (N)» per spec §7; type additions)
- Modify: `src/app/(app)/clients/page.tsx` (`_count.gazoblokOrders?: number`; «+N газоблок» muted under the orders count when > 0)

**Interfaces — Consumes:** Task 2 `clientGazoblokSummary` (already tested there).

- [ ] **Step 1:** Implement the four edits (beam `totalBooked`, `orderCount`, sorting untouched).
- [ ] **Step 2:** `npx tsc --noEmit` — 0; `npx vitest run tests/gazoblok-dashboard.test.ts` — PASS.
- [ ] **Step 3:** Browser: a gazoblok-only client shows the card with debt; a beam-only client shows no card; list shows «+1 газоблок». Long client name and 0-debt cases. Screenshots → `docs/screenshots/gazoblok-stage2/client-*.png`.
- [ ] **Step 4: Commit** the four files → `Feat(gazoblok) · client page shows gazoblok orders and debt`.

### Task 8: Excel backup sheet

Parallel group: E

**Files:**
- Create: `src/lib/gazoblok-export.ts`; Test `tests/gazoblok-export.test.ts`
- Modify: `src/app/api/orders/export/route.ts` (query per spec §8; pass `gazoblokRows`, `gazoblokColumns` in `workerData`)
- Modify: `src/workers/order-export-worker.js` (after the status sheets: if `gazoblokColumns` given, add sheet `GAZOBLOK`, same header style, «(no orders)» row when empty)

**Interfaces — Produces:**
- `GAZOBLOK_EXPORT_COLUMNS: { header: string; key: string; width: number }[]` — headers exactly spec §8, in order.
- `gazoblokExportRow(o: GazoblokExportInput): Record<string, string | number | Date | null>` where `GazoblokExportInput` = the route's query row with Decimals already `Number`ed (define the type in the lib).
**Consumes:** `lineQuantities`, `unpaidOverload`.

- [ ] **Step 1: Failing tests** — every column key present in the row; order with lines A(200) loaded 232 over 2 trucks (1 PENDING) → `lines "600×300×200: 200/232"`, `blocksOver 32`, `trucks "2/3"`; `remaining = max(0, total − confirmed − pending)`; `seller` = createdBy name or `""`; header list equals the spec list.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** lib, route, worker.
- [ ] **Step 4: Run** test + `npx tsc --noEmit` — PASS; download `/api/orders/export` as owner, open with `node -e` + ExcelJS: sheet names end with `GAZOBLOK`, row count = gazoblok orders + 1.
- [ ] **Step 5: Commit** the four files → `Feat(gazoblok) · gazoblok sheet in the Excel backup`.

---

### Task 9: Verification and owner gate (sequential, after 4–8)

**Files:** none committed except screenshots folder if the owner wants it; throwaway `precast-crm/tmp-verify-gazoblok-s2.cjs` (puppeteer-core, same pattern as `tmp-verify-gazoblok.cjs`, NOT committed).

- [ ] **Step 1:** `npx tsc --noEmit` → 0 errors.
- [ ] **Step 2:** `npx vitest run` → all files pass (Stage 1 baseline 1961 tests + new).
- [ ] **Step 3:** `npm run build` (foreground, one build only) → success; `npm run openapi:check` → unchanged.
- [ ] **Step 4:** Script on 3106: owner login → `/gazoblok/dashboard` (KPIs, chart tooltip, over-load table rows link to orders), viewBasic user → no money sections and API `money === null`, operator records a payment → bell shows «Газоблок тўлови …» for the owner and the click lands on `/gazoblok/orders/{id}`, `/payments` gazoblok section confirm, client page card, Excel sheet. Light + dark, 1440 + 412 → `docs/screenshots/gazoblok-stage2/`. Prints PASS/FAIL per check; all PASS.
- [ ] **Step 5:** Fresh whole-stage review; fix Critical/Important with a test each; `graphify update .`; report to the owner with screenshots, the `db push` note (one new column at deploy) and the calls in spec §10. Stop: deploy only on "deploy".
