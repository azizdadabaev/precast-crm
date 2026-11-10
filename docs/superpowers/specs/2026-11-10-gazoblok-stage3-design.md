# Gazoblok Stage 3 — missing features — design

Date: 2026-11-10 · Branch `feat/gazoblok-renovation` · Parent spec: `2026-11-10-gazoblok-renovation-design.md` (§2 owner
decisions and §4 Stage-1 rules are binding here) · Built **after** Stage 2 (dashboard + connections), web only.
Visual direction: `C:\Users\aziz\Downloads\gazoblok-visual\direction.md` + `comps/01,05,07,08`.

## 1. What Stage 3 adds

| # | Feature | Exists today? | Plan |
|---|---|---|---|
| F1 | **Reorder** — new order for the same client from a past order | no | new |
| F2 | **Order edit / reschedule** | no (research C: "No edit … dead end") | new, mirrors beam-and-block `order-edit-policy` |
| F3 | Refunds UI polish | Stage 1 inline form in `GazoblokDebtPanel` | reuse beam-and-block `RefundDialog` |
| F4 | **Stock history** (movements ledger) | no (research D5) | new section on `/gazoblok/stock` (comp 08) |
| F5 | Delivery location pin | beam-and-block has it (`DeliveryLocationCard`, `api/orders/[id]/delivery-location`) | reuse |
| F6 | Quote card to chat | beam-and-block: `SendQuoteToChatButton` (DOM capture → `/api/inbox/[id]/reply-photo`), `ShareCalculationButton` | reuse; new gazoblok card body |
| F7 | Orders list search / filters / paging | text + status, `take: 100` | extend (comp 05) |
| F8 | Clean Uzbek text sweep | partial | sweep all gazoblok screens + event messages |
| F9 | Order-screen fixes from the design audit + Stage-1 deferred minors | — | polish |

Owner decisions applied: Latin «B-» numbers stay; awaiting payment = muted grey chip; payment awaiting confirmation =
orange `warning` chip «Тасдиқланмаган»; delivery is a manual button; no password on cancel; «Click»/«Payme» stay Latin;
delivery price is what the operator types (never copied or computed automatically).

## 2. Schema (additive, nullable — `prisma db push`)

`GazoblokOrder` gains:
- `sourceOrderId String?` + `sourceOrder GazoblokOrder? @relation("GazoblokReorder", fields:[sourceOrderId], references:[id], onDelete: SetNull)`,
  back-relation `reorders GazoblokOrder[] @relation("GazoblokReorder")`, `@@index([sourceOrderId])`.
- `deliveryLat Float?`, `deliveryLng Float?`, `deliveryLocationUrl String?`, `deliveryLocationLabel String?` — same names
  and meaning as `Order` (lat/lng are the truth; the URL keeps the pasted link).

No enum changes. Event `type` is a free string; new types: `ORDER_EDITED`, `ORDER_RESCHEDULED`, `DELIVERY_LOCATION_SET`,
`DELIVERY_LOCATION_CLEARED`. Prod gets the columns at deploy time (owner runs `db push`; rollback = columns unused).

## 3. F1 — Reorder

Owner: "sometimes the same client will order for 2nd time, we should have a feature as new order or reorder for the same
client." **Behaviour:** the order screen header has «Қайта буюртма» (needs `order.create`). It opens
`/gazoblok/new?from=<orderId>` — the normal new-order form, **prefilled**, which the operator checks and places. One
click to a ready form; nothing is placed without the operator pressing «Буюртма бериш».

**Draft route** `GET /api/gazoblok/orders/[id]/reorder` (`order.create`) → `200`:
```
{ source: { id, orderNumber, placedAt, status },
  client: { name, phone, address },          // current Client row, not the old snapshot
  lines:   [{ productId, label, quantity, unitPrice, previousUnitPrice, previousLoaded }],   // active sizes only
  dropped: [{ label, quantity }],            // sizes archived or deleted since — shown, not ordered
  previous: { deliveryCost, discountPercent, scheduledAt } }   // hints only
```
- `quantity` = the source line's **ordered** quantity; `previousLoaded` is shown next to it («олдин юкланган 220»), so an
  operator whose client took 220 of 200 sees it and types 220.
- `unitPrice` = **today's** catalog `pricePerBlock` (the POST prices from the catalog anyway; the draft only shows it).
  `previousUnitPrice` is shown when it differs («олдин 18 000»).
- Delivery cost, discount, date, payment, wall-calculator snapshot and map pin are **not** copied; delivery and discount
  appear as greyed hints («олдин: 300 000 UZS»). Owner decision 5: delivery is agreed each time.
- Works from any status (a cancelled order is still a valid template). 404 if the order does not exist.

**Place:** `POST /api/gazoblok/orders` accepts optional `sourceOrderId: string`. The server checks it exists (422
«Асл буюртма топилмади» otherwise) and stores it; `ORDER_PLACED` payload gets `reorderOf: <orderNumber>` and the
message reads «Қайта буюртма (B-2026-11-0012 асосида) — Тест Мижоз».
**Screens:** new order shows a strip «Қайта буюртма: B-2026-11-0012 асосида» with the dropped sizes listed; the client
fields are prefilled (same phone → no rename question). The new order's header shows «B-…0012 асосида» (link); the
source order lists «Қайта буюртмалар: B-…0031, B-…0040». Stage 2's client page may link to the same URL.

## 4. F2 — Order edit and reschedule

**Route** `PATCH /api/gazoblok/orders/[id]/edit` (separate file, like beam-and-block `orders/[id]/edit`). Body
(`GazoblokEditOrderSchema`, every field optional, at least one present):
```
{ lines?: [{ lineId?: string, productId: string, quantity: int ≥ 1 }],   // the full new line list
  discountPercent?: 0..100, discountAmount?: ≥0, deliveryCost?: ≥0,
  scheduledAt?: ISO date | null, notes?: string | null }
```
**Who and when** (pure `editPolicy` in `src/lib/gazoblok-edit.ts`):
- Order must be open: `PLACED`/`IN_PRODUCTION`, not closed short. DELIVERED / CANCELED / closed short → 409 (finished
  orders are final — Stage 1 rule).
- Date and notes only ("reschedule"): `order.edit`, also after trucks were loaded.
- Lines, discount or delivery: `order.edit` while **nothing is loaded**; once any block is loaded, only
  `order.editShipped` (same as beam-and-block, owner rule 2026-10-06). This also stops a selling operator from raising
  a line to swallow an over-load and hide their debt.

**Rules** (pure `editPlan`):
- A line's new quantity may not go below its **loaded** count; a line with loaded > 0 cannot be removed → 409
  «Юкланганидан кам қилиб бўлмайди — 600×300×200: юкланган 168, янгисида 150».
- Existing lines keep their **frozen** `unitPrice` (the client was quoted it); new sizes take today's price and must be
  active (422 otherwise). The same product may appear once.
- Totals recompute exactly as placement + Stage 1: `orderTotal(lines, {discountPercent | discountAmount, deliveryCost})`
  where an absent discount re-applies the stored `discountPercent`; `overshipAmount = computeOvership(newLines, shipments)`;
  `totalPrice = subtotal − discount + delivery + overship`; `totalBlocks`, `totalVolumeM3` recomputed;
  `paymentState = paymentStateFor(confirmedPaid, 0, totalPrice)`. Stock never moves on edit.
- If the new total drops below confirmed money, the Stage-1 «Қайтариш керак» panel appears by itself. Pending payments
  stay pending (as beam-and-block).
- No change at all → 409 «Ўзгариш йўқ».
- Under the order row lock, re-read inside the transaction (Stage-1 pattern).

**Log:** one event per save. Date-only → `ORDER_RESCHEDULED` «Сана: 12.11.2026 → 14.11.2026». Otherwise
`ORDER_EDITED` with a message listing each change («600×300×200: 200 → 250 та; Етказиб бериш: 300 000 → 350 000 UZS;
Жами: 3 900 000 → 4 850 000 UZS») and payload `{ before, after, changes[] }`; plus `recordAudit("gazoblok.order.edit")`.
Response: `200 { id, totalPrice, paymentState, refundDue }`.

**UI:** header action «Таҳрирлаш» opens `GazoblokEditOrderDialog` (bottom sheet on phone): per size an input with
«камида 168 (юкланган)», add size, discount, delivery, date, notes, live preview «Жами: 3 900 000 → 4 850 000 UZS» and
«Қайтариш керак бўлади: X» when it would fall below paid. Fields the user may not change are disabled with the reason
in place («Юк жўнатилган — фақат эгаси ўзгартира олади»). «Санани ўзгартириш» next to «Жадвал:» edits only the date.
**Not in scope:** changing the client or phone (identity rule: phone is the client id; that belongs on the client page).

## 5. F3 — Refunds UI polish

- The refund-owed panel keeps its figure; its button «Пулни қайтариш» opens beam-and-block's `RefundDialog` (prefilled
  with the full amount, capped, reason ≥ 5 chars). `RefundDialog` gains two optional props, default behaviour
  unchanged: `submit?(v: { amount; method; paidOn; note }): Promise<void>` and `showDate?: boolean` (gazoblok passes
  `false` — `GazoblokPayment` has no paid-on date).
- `record_refund` now **requires** `notes` 5–500 chars (validation change; branch not deployed).
- Refund rows in the payments table: amount «−500 000» in `warning`, chip «Қайтарилди», who + date. Users without
  `payment.confirm` see «Фақат тўловни тасдиқловчи қайтара олади» instead of the button.
- `parseDecimal` accepts thousands spaces (`"1 000 000"`, NBSP) — fixes the deferred minor for every money input.

## 6. F4 — Stock history

`GET /api/gazoblok/stock/movements` (`inventory.view`) — query `productId?`, `reason?` (enum), `cursor?` (movement id),
`limit?` (default 50, max 200) → `200 { items, nextCursor }`, newest first, item:
`{ id, createdAt, productId, productLabel, change, resultingQuantity, reason, note, actor: {id,name}|null,
order: {id, orderNumber}|null, shipmentNumber: number|null, productionEntryId }`. `shipmentNumber` is looked up from
`shipmentId` (no relation exists — second query).
`GET /api/gazoblok/stock` adds `reserved: number` per product = Σ **left** (ordered − loaded, ≥ 0) over open orders
(PLACED/IN_PRODUCTION, not closed short). The stock table shows «Омборда / Буюртмаларга керак / Бўш / Чегара» (comp 08);
«Бўш» = stock − reserved, red when < 0.
**UI:** section «Ҳаракатлар тарихи» under the stock table: size pills («Барча ўлчамлар», each size), reason select,
rows «сана вақт · ким · нима · ўлчам · ±N · қолдиқ», «Кўпроқ кўрсатиш» pages. Reason texts: SHIPMENT_LOAD «Машина
юкланди · Жўнатма N · B-…» (order linked), SHIPMENT_CORRECTION «Юк тузатилди · Жўнатма N · B-…», PRODUCTION «Ишлаб
чиқарилди», MANUAL_ADJUSTMENT «Қўлда тузатиш · «изоҳ»», SALE «Буюртма етказилди (эски тартиб)», CANCELLATION_RESTOCK
«Бекор қилинди — омборга қайтди». Phone: stacked rows (comp 08). Route stays under `/gazoblok/stock` (page rule
`inventory.view` already covers it).

## 7. F5 — Delivery pin

`PATCH /api/gazoblok/orders/[id]/delivery-location` (`order.edit`), body = beam-and-block `DeliveryLocationBody`
(imported from `@/app/api/orders/[id]/delivery-location/schema`). Refused (409) on CANCELED/DELIVERED orders. Clearing =
`lat:null,lng:null`. Logged: `DELIVERY_LOCATION_SET` «Манзил белгиланди: <label|lat,lng>» / `DELIVERY_LOCATION_CLEARED`.
Response `{ id, deliveryLat, deliveryLng, deliveryLocationUrl, deliveryLocationLabel }`. The order screen renders the
existing `DeliveryLocationCard` (works without a Maps key via pasted link). Not copied by reorder.

## 8. F6 — Quote card to chat

New `GazoblokShareCard` (white card, like `CalculationShareCard`: brand header, `B-…` number, client, per size
«ўлчам · та · нарх · сумма», discount, delivery, **Жами UZS**, weight via `orderWeightKg` (611 kg/m³), volume «м³»). Order
screen: `ShareCalculationButton` (download PNG) + `SendQuoteToChatButton` (`conversationId={null}` → chat picker;
shown only with `inbox.access`, enforced server-side by `/api/inbox/[id]/reply-photo`). Caption mirrors beam-and-block:
`№B-… · Name / Жами: X so'm / Оғирлик: N кг`. Quantities on the card are **ordered** quantities; a closed-short order
shows loaded quantities (what is billed). **Server-rendered** card (`/internal/quote-card/…` + puppeteer) is deferred to
Stage 4 (Android needs it; the web follows beam-and-block's web path).

## 9. F7 — Orders list search, filters, paging

`GET /api/gazoblok/orders` keeps returning an **array** (the only consumer is the list page; Stage 2 must not depend on
it). New query params, all optional: `q` (order number / client name / phone — digits-only match, so «111 22» finds
«1112233»), `status`, `pay` (`AWAITING_PAYMENT|PARTIALLY_PAID|FULLY_PAID`), `flag` (`debt` = unpaid over-load > 0 and
not cancelled; `refund` = refund due ≥ `OVERPAY_ALERT_MIN`; `unconfirmed` = has a pending payment), `seller` (user id),
`from`/`to` (placed date, `YYYY-MM-DD`, Tashkent day), `limit` (default 50, max 200), `cursor` (last order id). Items
gain `loadedBlocks`, `unpaidOverload`, `refundDue`. Flags resolve through one tested predicate `orderFlags()` run over
a light select of every order's money columns (gazoblok volume is hundreds of orders; no raw SQL), giving the id set
that the main query filters on. Next page = `cursor` of the last row; «Кўпроқ кўрсатиш» shows while a page came back full.
`GET /api/gazoblok/orders/counts` (`order.view`) → `{ all, byStatus: {PLACED,…}, flags: {debt, refund, unconfirmed},
sellers: [{id, name, count}] }` for the pill counts and the seller select.
**UI (comp 05):** wrapping 44 px filter pills (status + «Ортиқча юклаш» destructive + «Қайтариш керак» warning +
«Тасдиқланмаган»), payment select, seller select, date range; columns № · Мижоз (truncated, phone under) · Блоклар
«168 / 200» + 4 px bar · Жами · Қолди · Ҳолат · Тўлов · Белгилар; no coloured left stripe; phone = stacked cards, no
sideways scroll. Filters live in the URL query so a link reproduces the view. The money summary strip of comp 05 is
Stage 2's dashboard, not repeated here.

## 10. F8 — Uzbek text sweep

- Every visible string on `/gazoblok/*` through `<Bi>`/`useT`; units «м³», «мм», «та», «кг»; «UZS».
- API error strings stay `"Узбекча · English"`; screens show them through `uzPart(message, lang)` (UZ-only mode shows
  the Uzbek half). New `src/lib/gazoblok-text.ts`.
- Event history renders `eventText(type, message, payload)`: known types are rebuilt from the payload in Uzbek (fixes
  old rows like «Status PLACED → DELIVERED», «Order placed for …», «Payment of 1000000 …»); new events are written in
  Uzbek. Status names via one `STATUS_LABELS` map.
- Payment chips: «Кутилмоқда» muted, «Қисман» primary, «Тўлиқ» success; a pending payment is «Тасдиқланмаган»
  `warning` (list and order screen).
- Breadcrumb: `TopBar` gets `gazoblok: «Газоблок»` (today shows «—»).
- Catalog: titles Uzbek-only, «мм» everywhere, price inputs grouped, read-only with a note when the user lacks
  `pricing.edit` (research D1).

## 11. F9 — Order screen fixes and Stage-1 deferred minors

Order screen (comp 01): header money block — **Жами in foreground, never green unless fully paid**; «Тўланган» green;
«Қолди»; «Шундан ортиқча юклаш» when > 0. «Буюртма етказилди» disabled with its reasons listed in place (from
`canDeliver`), «Бекор қилиш» disabled with «N та юкланган». Every dismiss button says «Орқага». Volume «м³». Payment
amount input accepts «1 000 000» and groups as you type. History as «ким · нима · дд.мм.йййй сс:дд» rows.
Deferred minors folded in: (1) `record_payment` re-checks CANCELED **under the lock**; (2) close short recomputes
`totalVolumeM3` from loaded blocks; (3) `parseDecimal` with spaces; (4) unused `foldForSearch` import removed from
`mcp/quote/gazoblok.ts`; (5) stale "auth-only / stock decrements when delivered" doc comments fixed in orders
GET/POST, stock GET/POST and `[id]` GET; (6) reconcile script: plan **inside** the transaction, undo file written
before commit is reported, new `--undo=<file>` replays the inverse moves (dry-run unless `--apply`); (7) over-load
confirm no longer saves photos twice (route checks over-load before saving files). Not taken: money as Decimal library
(systemic, separate).

## 12. Permissions summary

Reorder draft + place `order.create` · edit date/notes `order.edit` · edit lines/money: `order.edit` before loading,
`order.editShipped` after · delivery pin `order.edit` · refund `payment.confirm` · stock history `inventory.view` ·
counts/list `order.view` · send to chat `inbox.access` · share PNG `order.view`.

## 13. Edge cases

Reorder from an order whose every size is archived → draft with `lines: []`, all in `dropped`; form shows «Барча
ўлчамлар архивда» and cannot place until a size is added. Reorder of a client whose phone changed since → current Client
row is used. Edit racing a truck load → both lock the order row; edit re-reads loaded counts under the lock. Edit
adding the same product twice → 422. Edit on an order with a confirmed over-load raising the line to cover it →
allowed only with `order.editShipped`, logged with before/after over-load. Filters with no result → «Бу шартларга мос
буюртма йўқ» + «Фильтрларни тозалаш». Stock history of a deleted order → `order: null`, shows «—». Long client names
truncate with a title tooltip. Very large numbers (999 999 999 UZS) keep one line in the mono face.

## 14. Calls I made (owner may overrule)

1. Reorder opens a **prefilled form**, it does not place an order by itself.
2. Reorder copies **ordered** quantities (loaded shown beside); not delivery, discount, date, payment, pin or calculator.
3. Edit after loading needs `order.editShipped` (beam-and-block parity) — also guards over-load debt from being edited away.
4. Existing lines keep their placement price on edit; new sizes take today's price.
5. Edit never changes the client; client corrections live on the client page.
6. Quote card is captured from the page (web path of beam-and-block); the server renderer waits for Stage 4.
7. Stock history is a section of the stock page (comp 08), not a separate route.
8. Orders list API stays an array (cursor paging) so nothing else breaks; summary money strip left to Stage 2.
9. Sidebar regrouping (direction.md) is left to Stage 2, which adds the dashboard entry to the same group.
