# Gazoblok Stage 2 — own dashboard and connections (design)

Date: 2026-11-10 · Branch `feat/gazoblok-renovation` (Stage 1 built: f3e80be..d3fe9c5) · Web only
Authority: `2026-11-10-gazoblok-renovation-design.md` §2 (owner decisions) and §3 (stage table). Research map:
`C:\Users\aziz\Downloads\gazoblok-renovation-research-2026-10-20.md` (the "island" table). Visual direction:
`C:\Users\aziz\Downloads\gazoblok-visual\direction.md` + `comps/06-dashboard.html`.

## 1. Intent

Owner: "gazablok will have its own dashboard" (separate, not merged into beam-and-block) and "same permission levels
will apply". The key ask: over-load debt must "point out to the selling operator and ask where is the leftover money".
Stage 2 also wires gazoblok into the places that today don't know it exists: payments queue + bell, client page,
Excel backup, a day plan. Nothing in Stage 2 changes how an order, payment or stock movement is written.

## 2. Surfaces checked in code (grep, this worktree)

| Surface | Exists? | Stage 2 call |
|---|---|---|
| Beam dashboard `/dashboard`, `src/lib/dashboard-data.ts`, `/api/dashboard/*` | yes, `prisma.order` only | **untouched**. Gazoblok gets its own page + API (owner: separate) |
| Payments queue `/payments`, `GET /api/payments` | yes, `prisma.payment` only; response is a bare array the Android queue parses | **separate** `GET /api/gazoblok/payments` + a «Газоблок тўловлари» section on `/payments`. The beam API is not unioned (Android contract) |
| Bell: `Notification`, `emitNotifications`, `targetUrl` | yes; no gazoblok link column; gazoblok emits only @mentions without a link | additive `Notification.gazoblokOrderId`; emit placed / payment pending / confirmed / rejected |
| Client page `GET /api/clients/[id]`, `clients/[id]/page.tsx` | yes; `orders` only | additive `gazoblokOrders` + `gazoblok` summary; own card on the page |
| Client list `GET /api/clients` | yes; `_count {deals, orders}` | additive `_count.gazoblokOrders`; muted «+N газоблок» in the orders cell |
| Cash ledger `/ledger`, `/api/ledger`, `/api/ledger/events` | yes, owner-only; it *explains the beam dashboard's totals* | **not wired** (ruling 4) |
| Cash-in-transit (driver custody, `payments/[id]/handover`) | yes, beam only: driver collects → hands over | **does not exist for gazoblok** (no drivers on `GazoblokShipment`, no `collectedByDriver`); nothing to wire |
| Excel backup `GET /api/orders/export` + `src/workers/order-export-worker.js` | yes, `order.exportBackup`, beam only | add a `GAZOBLOK` sheet to the same workbook |
| Calendar: `CapacityCalendar` + `GET /api/orders/capacity` | yes: beam **floor m² capacity** picker, used in PlaceOrderDialog / Reschedule / orders filter; Android reads the route | **not merged** (ruling 5). Gazoblok gets a 7-day plan on its dashboard |
| MCP `get_dashboard` | beam only | out of Stage 2 (follow-up) |

## 3. Permissions (existing keys only)

| Route / page | Permission |
|---|---|
| page `/gazoblok/dashboard`, `GET /api/gazoblok/dashboard` | any of `dashboard.view`, `dashboard.viewBasic` (same as `/dashboard`) |
| money blocks inside that response (`money`) | `dashboard.view` only — **stripped server-side** for viewBasic (ruling 2) |
| `GET /api/gazoblok/payments` | `payment.view` (same as `/payments`) |
| confirm / reject from the queue | `payment.confirm`, enforced by the existing `PATCH /api/gazoblok/orders/[id]` `confirm_payment` |
| client page gazoblok card | `client.view` (same as the beam orders on that page) |
| `GAZOBLOK` sheet | `order.exportBackup` (same route) |

`page-auth.ts` gets `"/gazoblok/dashboard": ["dashboard.view", "dashboard.viewBasic"]` (longest prefix beats `/gazoblok`).
Sidebar: one item «Газоблок бошқаруви» → `/gazoblok/dashboard`, same permission pair, placed right after «Газоблок».

## 4. Dashboard — data contract

Pure math in `src/lib/gazoblok-dashboard.ts` (no Prisma, no `new Date()` — `now` passed in); queries in
`src/lib/gazoblok-dashboard-data.ts`; route `src/app/api/gazoblok/dashboard/route.ts` (`withPermissionAny`).
Money as `Number(Decimal)` + `round2`, as everywhere in the codebase. Local-time months via `monthWindow(now, 12)` /
`monthKey` from `dashboard-metrics.ts`.

**Queries** (all `prisma.gazoblok*`):
1. Booked: `gazoblokOrder.findMany({ where: { status: { not: "CANCELED" }, placedAt: { gte: windowStart } }, select: { placedAt, totalPrice, totalBlocks, totalVolumeM3 } })`.
2. Collected: `gazoblokPayment.findMany({ where: { status: "CONFIRMED", confirmedAt: { gte: windowStart } }, select: { amount, confirmedAt } })` — refunds are negative CONFIRMED rows and net out; payments on later-cancelled orders count (cash is cash).
3. Owed: `gazoblokOrder.findMany({ where: { status: { not: "CANCELED" }, NOT: { status: "DELIVERED", paymentState: "FULLY_PAID" } }, select: { id, orderNumber, totalPrice, confirmedPaid, overshipAmount, createdById, createdBy: { select: { name } }, client: { select: { name } }, lines: { select: { id, productId, productLabel, quantity } }, shipments: { select: { loadedLines } } } })`.
4. Unconfirmed: `gazoblokPayment.aggregate({ where: { status: "PENDING_CONFIRMATION", order: { status: { not: "CANCELED" } } }, _sum: { amount }, _count: { _all } })`.
5. Stock: `gazoblokProduct.findMany({ where: { active: true }, orderBy: { seq: "asc" }, select: { id, label, lowStockThreshold, stock: { select: { quantity } } } })`.
6. Open orders: `gazoblokOrder.findMany({ where: { status: { in: ["PLACED", "IN_PRODUCTION"] } }, select: { id, orderNumber, scheduledAt, shortClosedAt, client: { select: { name } }, lines: { select: { id, productId, productLabel, quantity, product: { select: { lengthM, heightM, thicknessM } } } }, shipments: { select: { id, number, status, loadedLines, loadedAt, deliveredAt } } } })`.
7. Delivered today on finished orders: `gazoblokShipment.findMany({ where: { deliveredAt: { gte: startOfToday }, order: { status: "DELIVERED" } }, select: shipment fields + order { id, orderNumber, client name, lines (as 6) } })`.

**Response** `GET /api/gazoblok/dashboard` → `ok(GazoblokDashboard)`:
```ts
type GazoblokDashboard = {
  generatedAt: string;
  money: null | {                       // null without dashboard.view
    months: { key: string; label: string; year: number;          // 12, oldest → newest
              booked: number; orders: number; blocks: number; volumeM3: number; collected: number }[];
    receivables: { total: number; orders: number };              // Σ max(0, total − confirmedPaid)
    unconfirmed: { total: number; count: number };               // PENDING_CONFIRMATION
    overload: { total: number; extraBlocks: number; orders: number; operators: OverloadOperator[] };
  };
  stock: { productId: string; label: string; onHand: number; reserved: number; free: number;
           state: "ok" | "low" | "out" }[];
  trucks: TruckRow[];
  plan: { date: string; orders: { id: string; orderNumber: string; clientName: string; blocksLeft: number }[] }[];
  unscheduledOpen: number;
};
type OverloadOperator = { operatorId: string | null; name: string | null; extraBlocks: number; unpaid: number;
  orders: { id: string; orderNumber: string; clientName: string; extraBlocks: number; unpaid: number }[] };
type TruckRow = { shipmentId: string; orderId: string; orderNumber: string; clientName: string; number: number;
  status: "PENDING" | "LOADED" | "DELIVERED"; blocks: number; weightKg: number; overBlocks: number; at: string | null };
```
**Rules.**
- Over-load debt per order = `unpaidOverload({ overshipAmount, totalPrice, confirmedPaid })` (Stage 1 rule: extra is the
  last money in). Rows with 0 are dropped; extra blocks = Σ `over` from `lineQuantities`. Grouped by `createdById`;
  `null` = legacy order not backfilled → name `null`, UI «Номаълум (эски буюртма)». Sorted by unpaid desc.
- `reserved` per product = Σ `left` over open orders that are **not** short-closed; `free = max(0, onHand − reserved)`;
  `state`: `out` when onHand ≤ 0, `low` when free ≤ `lowStockThreshold`, else `ok`.
- Trucks = shipments PENDING or LOADED on open orders + shipments delivered today; `at` = deliveredAt ?? loadedAt;
  `blocks` = Σ loadedLines (0 for PENDING); `weightKg` via `loadWeightKg`; `overBlocks` = this order's total over (shown
  only when > 0). Order: LOADED first, then PENDING, then DELIVERED today; within a group by `at`.
- Plan = open orders whose `scheduledAt` falls on today … today+6 (local day; owner rule "one order = one day", the
  scheduled day), grouped per day, `blocksLeft` = Σ left; days with no orders omitted. `unscheduledOpen` = open orders
  with `scheduledAt` null.

## 5. Dashboard — UI (`/gazoblok/dashboard`)

Follows `comps/06-dashboard.html` with app tokens only (`--card`, `--border`, `--border-strong`, `--foreground`,
`--muted-foreground`, `--primary`, `--success`, `--warning`, `--destructive`; figures `font-[var(--font-num)]`
`tabular-nums`; title `--font-display`). Reuse `Card`/`Chip`/`Button` from `src/components/ui`. 44 px controls.

1. Header: «Газоблок бошқаруви» + lede «Пул, қарзлар, омбор ва машиналар. Йиғма монолитдан алоҳида.»
2. KPI strip (dashboard.view only), one bordered card, 4 cells (2×2 on phones):
   «Даромад, {ой}» `booked` UZS · «N та буюртма» — «Тушган пул» `collected` in success · «тасдиқланган тўловлар», and
   when unconfirmed > 0 a warning line «+X UZS тасдиқланмаган» — «Қарздорлик» `receivables.total` · «N та очиқ буюртма» —
   «Ортиқча юклаш қарзи» in destructive · «N та оператор». The month is the selected chart bar (default current).
3. «Ойлик даромад» bar chart (dashboard.view): 12 CSS bars `--foreground / .18`, selected bar `--primary`; one tooltip
   «{Ой} {йил} / X UZS · N та буюртма / B та блок · V м³ / Тушган: Y UZS». Click selects the month for the KPIs.
4. Two columns (one on phones):
   - «Ортиқча юклаш: кимдан сўраш керак» (dashboard.view): table Сотувчи оператор · Буюртма · Ортиқча · Тўланмаган, UZS;
     each operator row lists its order numbers as links to `/gazoblok/orders/[id]`; footer «Жами»; unpaid in destructive.
     Empty: «Ортиқча юклаш қарзи йўқ».
   - «Омбор» + link «Омборга ўтиш»: Ўлчам, мм · Омборда · Буюртмага керак · Бўш; chip «Кам» (warning) / «Тугаган» (danger).
5. «Машиналар»: rows time · client · B-number · «Жўнатма N · B та · K кг» (+ «ортиқча +N» destructive) · chip
   «Етказилди» success / «Юкланди» warning / «Кутилмоқда» neutral. Empty «Очиқ машина йўқ».
6. «Келгуси 7 кун»: per day «дд.мм.йййй · N та буюртма · B та блок қолди», order links; footer «Санасиз: N та очиқ
   буюртма» when > 0. Empty «Режалаштирилган буюртма йўқ».
viewBasic users see 1, 4-right, 5, 6 only. Loading = skeleton blocks; error = «Юклаб бўлмади: …».

## 6. Payments queue + bell

**`GET /api/gazoblok/payments?status=PENDING_CONFIRMATION|CONFIRMED|REJECTED`** (default PENDING_CONFIRMATION; other
values 400) → `ok({ items, counts: { pending, confirmed, rejected } })`, newest first, `take: 200`:
`items[i] = { id, amount, method, status, recordedAt, confirmedAt, notes, recordedBy: {id,name} | null,
confirmedBy: {id,name} | null, receipts: {id,imageUrl}[], order: { id, orderNumber, totalPrice, confirmedPaid,
status, client: { id, name, phone } } }`. Counts via `groupBy(status)`.

**`/payments` page:** new section «Газоблок тўловлари» under the beam list (`GazoblokPaymentsQueue.tsx`): pills
«Тасдиқланмаган (N)» / «Тасдиқланган» / «Рад этилган». Row: B-number link, client + phone, amount UZS (mono, right),
method via `PAYMENT_METHOD_LABELS` (Click/Payme in Latin), «{ким} · дд.мм.йййй сс:дд», receipt thumbnails, chip
«Тасдиқланмаган» (warning/orange). With `payment.confirm`: «Тасдиқлаш» and «Рад этиш» (dialog: reason input,
«Рад этиш» / «Орқага»). Both call `PATCH /api/gazoblok/orders/[orderId]` `{ action: "confirm_payment", paymentId,
approve, rejectionReason }` and invalidate the queue. Errors shown in Uzbek from the API message.

**Bell.** Schema (additive, nullable): `Notification.gazoblokOrderId String?` + `@@index([gazoblokOrderId])`.
`CreateNotificationInput.gazoblokOrderId`, persisted, in the SSE payload and the push data (`""` when null; Android
decodes with `ignoreUnknownKeys`). `NotificationItem.gazoblokOrderId`; `targetUrl` checks it first →
`/gazoblok/orders/{id}`. Emitted (after commit, fire-and-forget, recipients exclude the actor), titles built by pure
`src/lib/gazoblok-notify.ts`:
| When | Type | To | Title (uz · en) |
|---|---|---|---|
| order placed | `ORDER_PLACED` | `payment.confirm` holders | «Янги газоблок буюртма №B-… · New gazoblok order #B-…», body client name |
| payment recorded as PENDING (placement or `record_payment`) | `PAYMENT_RECORDED` | `payment.confirm` holders | «Газоблок тўлови X UZS · №B-… · Gazoblok payment …», body method label |
| confirm / reject | `PAYMENT_CONFIRMED` / `PAYMENT_REJECTED` | the recorder | «Газоблок тўловингиз тасдиқланди / рад этилди: X UZS · …» |
| @mention | `COMMENT_MENTION` | mentioned | existing title + `gazoblokOrderId` |
X via `formatNumber(x, 0)`. No new `NotificationType` values.

## 7. Client page

`GET /api/clients/[id]` adds (additive): `gazoblokOrders` (20 newest: `id, orderNumber, status, paymentState,
totalPrice, confirmedPaid, totalBlocks, placedAt, shortClosedAt`) and `gazoblok: { orderCount, totalBooked, debt }`
from pure `clientGazoblokSummary(rows)` over **all** the client's gazoblok orders (`select: { status, totalPrice,
confirmedPaid }`): count all, booked = Σ total of non-CANCELED, debt = Σ max(0, total − confirmedPaid) of non-CANCELED.
Beam `totalBooked` / `orderCount` unchanged. Page: card «Газоблок буюртмалари (N)» under the beam orders card —
summary line «Жами: X UZS · Қарз: Y UZS» (debt destructive when > 0), rows B-number link · date · blocks · total ·
payment chip (paid success «Тўланган», partial primary «Қисман», awaiting muted «Кутилмоқда»); hidden when N = 0.
`GET /api/clients`: `_count.select.gazoblokOrders: true`; list orders cell shows «+N газоблок» (muted, small) when > 0.

## 8. Excel backup

`GET /api/orders/export` also loads `gazoblokOrder.findMany({ take: 10_000, orderBy: { orderNumber: "asc" }, include:
{ client, createdBy: {name}, lines, shipments: { status, loadedLines }, payments: { amount, status } } })`, maps rows
with pure `gazoblokExportRow` and passes `{ gazoblokRows, gazoblokColumns: GAZOBLOK_EXPORT_COLUMNS }` to the worker,
which appends one sheet `GAZOBLOK` (same header styling; «(no orders)» row when empty). Columns (English, like the
beam sheets): Order #, Status, Payment state, Client name, Client phone, Client address, Seller, Placed at, Scheduled at,
Delivered at, Canceled at, Cancel reason, Short closed at, Short close reason, Lines («600×300×200: 200/240» =
ordered/loaded), Blocks ordered, Blocks loaded, Blocks over, Volume m³, Lines subtotal, Discount %, Discount amount,
Delivery cost, Over-load amount, Total price, Confirmed paid, Pending paid, Remaining, Unpaid over-load, Trucks
(«2/3» loaded-or-delivered / all), Notes, Order ID.

## 9. Tests

Pure units (vitest, `tests/`): dashboard math (months, receivables, over-load per operator incl. legacy null and
short-closed with extra, reserve/free/state, trucks order, plan window), client summary, notify titles, export row,
`targetUrl` gazoblok link, page rule for `/gazoblok/dashboard`, queue status parsing. Screens verified on the isolated
DB `precast_crm_gazoblok_reno` (port 3106), light + dark, 1440 + 412, as an owner and as a viewBasic user.

## 10. Calls I made (owner may overrule)

1. Own page `/gazoblok/dashboard`, own API, own components; the beam dashboard, its data lib and APIs are not touched.
2. Money on the gazoblok dashboard needs `dashboard.view`; `viewBasic` gets stock, trucks and plan. (The beam
   `/api/dashboard` returns money to viewBasic too and hides nothing server-side; gazoblok is stricter on purpose.)
3. Payments queue is a separate API + section on `/payments`, not a union into `GET /api/payments` (bare-array
   contract the Android queue parses; beam rows carry driver/handover fields gazoblok has no equivalent of).
4. Cash ledger stays beam-only: it exists to explain the beam dashboard's figures, and mixing gazoblok in would make
   its totals disagree with that dashboard. The gazoblok dashboard links every figure to its orders instead.
5. No cash-in-transit for gazoblok: shipments have no driver and no collected cash; there is nothing in transit.
6. Calendar: the beam capacity calendar is floor m² capacity (also read by Android); gazoblok blocks don't use floor
   capacity and the cell is already full. Gazoblok gets «Келгуси 7 кун» on its dashboard instead.
7. Revenue month = `placedAt` (booked), collected month = `confirmedAt`, like the beam default basis; no
   delivery-basis toggle in Stage 2.
8. Bell link via one additive nullable column (`Notification.gazoblokOrderId`); no new notification types; no
   push on over-load (the dashboard is where the owner asks the operator).
9. Client list total/sort unchanged (beam only); only a «+N газоблок» count is added.
10. Sidebar gets one item; the full «Газоблок» group from `direction.md` waits for Stage 3.

Non-goals: MCP dashboard, Android, the beam capacity calendar, ledger, reorder and other Stage 3 features.
