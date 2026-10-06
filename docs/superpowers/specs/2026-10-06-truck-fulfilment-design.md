# Truck fulfilment — design

Date: 2026-10-06 · Status: approved by owner in chat ("LOOKING GOOD, BUILD AND DEPLOY")
Branch: `feat/truck-fulfilment` (cut from `origin/main` = prod `642bf6ab`)

## 1. Why

Order 2026-08-0093 shipped in two trucks (29 Aug, 1 Oct). Three things went wrong:

- The dashboard's «Юкланган ҳажм» split the order's m² across trucks **by blocks**, and gave a
  lone first truck the **whole** order's m². August's m² dropped 132,9 m² after August closed.
- The stock book (`Омбор`) subtracts the **whole order** only when it is marked «Етказилган», so
  August's truck leaves stock in October (prod decision D-04).
- Rescheduling a partly shipped order puts the **whole** order (257 m²) on the new calendar day.

The owner also asked for two workflow features: editing partly shipped orders (owner only), and a
reschedule button on the order page.

## 2. Owner decisions (2026-10-06)

| # | Decision |
|---|----------|
| D1 | A truck is about **goods only**: exact beams per length and blocks. **No money value per truck.** Payments stay linked to the order, never to a truck. |
| D2 | «Сотилган» money card and "receivables = shipped − paid" are **dropped**. «Қарздорлик» and every money card stay exactly as today. |
| D3 | The goods-issue date is the **loading day** (`loadedAt`) — for m², stock and the calendar. |
| D4 | A truck's m² comes from **its beams** (rooms identified by beam length). Saved on the truck at loading; never rewritten. |
| D5 | Stock is written off **per truck at loading**. «Етказилган» writes off only what no truck recorded. Cancel returns exactly what was written off. |
| D6 | Calendar + «Бугунги етказишлар» follow real data: a day = goods that actually left that day + what is still left to ship of orders scheduled that day. |
| D7 | Once **any truck is loaded**, only holders of the new permission `order.editShipped` (the owner) can edit the order, until «Етказилган». Edits may not go below what has already been loaded. Later trucks follow the edited order. |
| D8 | Reschedule button on the order page: calendar popup → «Сақлаш» → confirmation → changes **only** `scheduledAt`. Same people as today (`order.edit`). |
| D9 | Web only. Android app code is not touched (it reads the same server data). |

## 3. Glossary

- **Loaded truck** — a `Shipment` with `loadedAt` set (status LOADED/DISPATCHED/DELIVERED), or a
  single-truck order with `Order.loadedAt` set.
- **Order lines** — the order's current rooms collapsed to beams per canonical length (2 dp) and a
  block total (`calcSnapshotToInventoryLines`).
- **Already loaded** — Σ of every loaded truck's counts.
- **Left to ship** — order lines − already loaded, clamped at 0 per line; zero once the order is
  physically complete (`physicalCompletion`) or is a single-truck order already on a truck.

## 4. Architecture

One pure module answers "what did each truck carry, when, and what is left". Every consumer uses
it, so the dashboard, ledger, calendar, today's list, stock and the edit guard cannot disagree.

```
src/lib/fulfilment.ts   (NEW, pure, browser-safe)
   beamAreaTable(rooms)            per length: pieces + m²  (pooled across rooms of that length)
   truckArea(loadedBeams, table)   m² carried = Σ pieces × (m² ÷ pieces) of that length
   loadedByLength(shipments)       already-loaded beams per length + blocks
   orderFulfilment(order)          events[] (date, source, beams, blocks, metres, m²) + leftToShip
   dayContribution(f, dayKey)      what one order puts on one calendar day
        ▲            ▲             ▲              ▲                ▲
 dashboard-data   ledger route   capacity route  orders?day=    edit route guard
 (loaded volume,                 (calendar)      (day list)     order page (reschedule preview)
  today, week)

src/lib/inventory.ts    (EXTENDED) shipmentToInventoryLines, netWrittenOff, remainingToWriteOff,
                        writeOffLines (DB), logStockWarnings (DB)
src/lib/order-edit-policy.ts (NEW, pure) editPolicy(), loadedFloorViolations()
```

`loaded-volume.ts` keeps its tested helpers (`beamsFromLoadedJson`, `roomBeamMeters`,
`physicalCompletion`, `remainderAfterRecorded`, `hasRemainder`, `accumulateLoaded`,
`loadMonthKey`). `areaShares` (the block-share rule) is deleted with its tests — D4 replaces it.

### 4.1 Event model (`orderFulfilment`)

Input: rooms (`beamLength`, `beamCount`, `totalBlocks`, `monolithArea`), order totals
(`totalArea`, `totalBlocks`, `totalBeams`), `status`, `loadedAt`, `deliveredAt`, `scheduledAt`,
shipments (`number`, `status`, `loadedAt`, `deliveredAt`, `loadedBeams`, `loadedBlocks`,
`loadedArea`).

Events, in this order (same precedence the dashboard uses today, so nothing double counts):

1. **Shipment** — one per loaded shipment, dated `loadedAt`. Beams/blocks = recorded counts.
   m² = `loadedArea` when saved, else `truckArea(loadedBeams, beamAreaTable(rooms))`.
2. **Single truck** — no loaded shipments and `Order.loadedAt` set: whole order, dated `loadedAt`,
   m² = `totalArea`.
3. **Completion remainder** — when `physicalCompletion` returns a date: order totals − everything
   recorded above, clamped ≥ 0 per dimension, dated at completion (unchanged rule).

Beam lengths a truck carried that match no room contribute **0 m²** at truck level; their area is
recognised by the completion remainder. Rooms with zero beams likewise. (The load route already
refuses unknown lengths, so this only affects legacy rows.)

**Left to ship** = 0 when the order is complete, CANCELED, or a single-truck order whose status is
LOADED/DISPATCHED (whole order on a truck). Otherwise order lines − already loaded per length,
blocks likewise, m² = `totalArea` − Σ truck m² (clamped ≥ 0).

### 4.2 Calendar day (`dayContribution`)

For one order and one local day key: Σ events dated that day + (left to ship, if `scheduledAt`
is that day). Returns m², blocks, beams, and tags (`trucks: [n…]`, `single`, `remainder`,
`leftToShip`, `shippedOtherDay`). An order "contributes" when any quantity > 0.

## 5. Behaviour by surface

| Surface | Change |
|---|---|
| `GET /api/orders/capacity` (web calendar + Android «Жадвал») | Per day: Σ `dayContribution` over candidate orders. `totalOrders` = contributing orders. Response shape unchanged. |
| `GET /api/orders?day=` | Candidates: `scheduledAt`, `loadedAt`, `deliveredAt`, any shipment `loadedAt`/`deliveredAt` in the day. Each item gains additive `dayActivity` (the contribution + tags). q-search and day filter combine with AND. |
| Orders page list (web) | When a day is picked, each row shows a small tag: «Жўнатма 2 · 111,43 м²», «Қолган · 111,43 м²», or «Бошқа куни жўнатилган». |
| Dashboard «Юкланган ҳажм» + `/api/ledger` | Built from `orderFulfilment` events (m² from beams / saved). |
| Dashboard «Бугунги етказишлар», week capacity | Built from `dayContribution` for today / each weekday. Per-order `totalArea` in `todayDeliveries.orders` = today's portion. Shape unchanged. |
| Money cards, receivables, order balance | **No change.** |

## 6. Stock (D5)

| Moment | Write-off |
|---|---|
| Split truck loaded (`/shipments/[sid]/load`) | Its recorded beams per length + blocks, in the same transaction; `StockMovement.shipmentId` set, reason `DELIVERY`, note «Жўнатма N». |
| Single truck loaded (`loadOrderWithPhoto` — CRM route **and** Telegram bot) | Order lines. |
| Order → DELIVERED (`delivery-proof`, `PATCH /orders/[id]`) | `remainingToWriteOff(order lines, net written off so far)` — never twice. |
| Order canceled | Restock `netWrittenOff` (what was actually written off), whether or not delivered. |

Net written off for an order = −Σ `change` of its `DELIVERY` movements − Σ `CANCELLATION_RESTOCK`,
per inventory item. Negative stock keeps raising `STOCK_WARNING` events (shared helper).

Schema (additive only):
- `StockMovement.shipmentId String?` → `Shipment` (`onDelete: SetNull`), `@@index([shipmentId])`.
- `Shipment.loadedArea Decimal? @db.Decimal(10, 3)` — m² saved at loading.

## 7. Editing partly shipped orders (D7)

`editPolicy({ status, shipments, permissions })`:

| Situation | Allowed? |
|---|---|
| CANCELED or DELIVERED | No |
| No shipments, status LOADED/DISPATCHED (single truck on a truck) | No |
| Any shipment loaded | Only with `order.editShipped` (plus `order.edit`) |
| Otherwise (PLACED/IN_PRODUCTION, nothing loaded) | `order.edit`, as today |

`loadedFloorViolations(newLines, alreadyLoaded)` — the edit is refused (422, Uzbek, lists each
length) if any beam length or the block total would drop below what is already loaded.

New permission `order.editShipped` — «Жўнатилган буюртмани таҳрирлаш · Edit partly shipped
orders (owner-only)». In the Calculator & Orders group, **in no role template** (opt-in). The owner
ticks it for their own account on the Users page.

Order page: the «Таҳрирлаш» button follows `editPolicy`; its tooltip says why when locked. The
calculator edit screen needs no change (server is the gate). After an edit, the split-load modal
already computes "what's left" from the current rooms, so later trucks follow automatically.

## 8. Reschedule (D8)

- `RescheduleDialog` (new): `CapacityCalendar` (past disabled), current date shown, preview
  m² = left to ship (via `orderFulfilment`, run in the browser). «Сақлаш» disabled until a different
  date is picked. Pressing it shows the confirmation «Етказиб бериш санаси {эски} → {янги}
  ўзгарсинми?» with «Ҳа, ўзгартириш» / «Бекор».
- Sends `PATCH /api/orders/[id] { scheduledAt }` with the same date encoding the edit flow uses.
  The existing `SCHEDULED_DATE_CHANGED` event is written (feeds delivery-adherence metrics).
- Button «Санани ўзгартириш» (calendar-clock icon) beside «Таҳрирлаш»; shown with `order.edit`
  and status not DELIVERED/CANCELED.
- Server: `PATCH` refuses a `scheduledAt` change on a DELIVERED order (422, Uzbek).
- No re-pricing (unlike edit → save, which re-prices against today's price table).

## 9. One-time backfill (owner confirms after dry run)

`scripts/backfill-truck-fulfilment.ts` — default **dry run** (prints a report, writes nothing);
`--apply` writes:
1. `Shipment.loadedArea` for every loaded shipment where it is null (new column only).
2. Stock write-off for loaded trucks of not-yet-delivered, non-canceled orders that have no
   movement yet (split trucks per `shipmentId`; single-truck LOADED orders by order lines), note
   «… (олдинги юклаш)». Without it, those trucks are written off at «Етказилган» — still correct,
   just later.

## 10. Error handling

Every route keeps its existing pattern (`fail(message, status)`, Uzbek first). New messages:
edit refused (permission / floor), reschedule refused (delivered). Stock write-off runs inside the
same transaction as the status change, so a failure rolls both back.

## 11. Testing

- Unit (vitest, pure): `fulfilment.ts` (order 0093 golden: 145,611 / 111,430 m²; unknown lengths;
  zero-beam rooms; single truck; legacy delivered; left to ship after an edit; day contribution),
  inventory pure helpers, `editPolicy`, `loadedFloorViolations`, date encoding helper.
- `tsc --noEmit`, full `vitest run`, `next build`.
- Local smoke (own DB `precast_crm_fulfil`): scripted scenario through the real routes on
  `next dev` — place order → split → load truck 1 → edit as owner → load truck 2 → deliver →
  check stock movements, capacity, dashboard, ledger; reschedule via the UI in light and dark.

## 12. Rollout

1. Read-only prod data check (needs owner permission): unknown beam keys on shipments, orders
   currently part-shipped, single-truck LOADED orders, current stock.
2. DB backup → build → `prisma db push` (additive: 2 columns, 1 FK, 1 index) → `up -d` → verify.
3. Backfill dry run on prod → owner confirms → `--apply`.
4. Owner grants themself `order.editShipped`.

Rollback: previous image tag; the new columns are nullable and unused by old code.

## 13. Out of scope

Android app changes; MCP tool changes; gazoblok line; any money/receivable change; per-truck value.
