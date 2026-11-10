# Gazoblok renovation — design

Date: 2026-11-10 · Owner: EtalonSlabs · Branch `feat/gazoblok-renovation` (cut from `origin/main` 172fc3d0) · Web first
Research: `C:\Users\aziz\Downloads\gazoblok-renovation-research-2026-10-20.md` (4 analysts, 20 Oct 2026). No gazoblok
code changed on main since that research, so its file/line references hold.

## 1. Intent

Owner, 20 Oct: "gazablok section needs total renovation. it lacks a lot … i am not satisfied with its current state."
The research found two problems: gazoblok **drifts** (stock and money stop matching the yard) and it is an **island**
(the dashboard, payments queue, client pages, calendar, Android app don't know it exists). The renovation fixes the
drift first, then gives gazoblok the same footing as beam-and-block.

## 2. Owner decisions (10 Nov 2026, verbatim where quoted)

1. **Own dashboard:** "gazablok will have its own dashboard" — separate from beam-and-block, not merged into it.
2. **Permissions:** "same permission levels will apply" — gazoblok uses beam-and-block's permission keys.
3. **Strict quantities:** "gazablok will have to be kept strict on how many loaded, how many left, how many ordered."
   Stock and the bill follow what was actually loaded; the full order is never written off or billed by default.
   **Reorder:** "sometimes the same client will order for 2nd time, we should have a feature as new order or reorder for
   the same client."
4. **Over-loading allowed, debt visible:** "clients will order 200pcs but … will need 400pcs … The system allows for
   overloading … but has to make sure to point out that the client owes us money so that i can point out to the selling
   operator and ask where is the leftover money for overloading. we should have clear logs of who performed what
   action, data+time."
5. **Delivery:** "dilevery will be discussed and decided by operators, system calculates at given prices." No automatic
   free-delivery rule anywhere.
6. Process: "proceed with the plan taking into consideration our approach and rules we have approved for CRM so that you
   will ask fewer questions."

Standing CRM rules that apply: Uzbek Cyrillic UI via `<Bi>`/`useT`; numbers `1 554` / `4,90`; TDD; build in a worktree
from `origin/main`; screenshots of built screens before deploy; **no push/deploy until the owner says "deploy"**;
destructive or data-changing operations on prod only with explicit confirmation and a rollback plan.

## 3. The four stages

| Stage | What | Size |
|---|---|---|
| **1 — Stop the drift** | stock, money, quantities, permissions, quote rule (§4) | ~2–3 days |
| 2 — Gazoblok dashboard + connections | own dashboard (revenue, debts incl. over-load debt per operator, stock), payments queue + bell, client page, cash ledger, Excel backup, calendar | medium |
| 3 — Missing features | Reorder, order edit/reschedule, refunds UI polish, stock history page, delivery pin, quote card to chat, search/filters, clean Uzbek text, order-screen fixes | medium |
| 4 — Android | gazoblok orders, load, deliver, photo, payment on the phone | large |

Each stage gets its own plan, is built and shown to the owner, and is deployed only on "deploy". This document fixes the
rules for all stages and specifies Stage 1 in full; stages 2–4 get their detailed design when they start.

## 4. Stage 1 — Stop the drift

### 4.1 Ordered / loaded / left — the quantity model

For every order line: **ordered** (frozen at placement), **loaded** (Σ over shipments' `loadedLines`), **left** =
max(0, ordered − loaded), **over** = max(0, loaded − ordered). These four numbers are shown on the order screen per size
and summed, and are what every rule below uses.

### 4.2 Stock moves per truck

- **Stock decrements when a shipment is LOADED** (the blocks have left the yard), by that shipment's `loadedLines`.
  Re-loading (correcting) a LOADED shipment posts only the difference (+/−). Movements carry the order, the shipment
  number and the actor.
- **Order DELIVERED moves no stock** (it already moved per truck).
- Stock movement reason: add `SHIPMENT_LOAD` (and `SHIPMENT_CORRECTION`) to `GazoblokStockReason`; keep `SALE` for
  history rows.

### 4.3 Closing an order — strict, never "full by default"

- **DELIVERED** requires: every line loaded ≥ ordered (or the order was closed short), every truck DELIVERED, and fully
  paid (owner rule 2026-07-23, unchanged). Every hand-over goes through a shipment — a customer pickup is one shipment.
  An order with nothing loaded can no longer be set DELIVERED.
- **Close short** (new): when the client stops before taking everything, an operator with `order.edit` closes the order
  with a reason (`shortClosedAt`, `shortCloseReason`, `shortClosedById` on the order; status unchanged). The order total
  is **re-billed on loaded quantities** (lines billed at loaded × unitPrice, discount pro-rated, delivery cost unchanged);
  the unloaded remainder is released (it never left stock). No more loading after close short. The order becomes
  DELIVERED by the same rule as above once its trucks are delivered and it is paid; while money is owed it stays open
  with the debt visible. Any overpayment becomes a refund owed (§4.6).
- **Corrections:** truck counts can be corrected only while the order is open (not DELIVERED, not CANCELED, not closed
  short). A finished order is final, as today.
- **Cancel** (requires `order.cancel`) is allowed only while **nothing has been loaded**. Once a truck has left, the
  order can only be closed short. Money already paid on a cancelled order becomes a refund owed (§4.6).

### 4.4 Over-loading — allowed, confirmed, owed, attributed

- Loading more than ordered is allowed. The server rejects unknown line ids and requires `confirmOverload: true` in the
  request when the load makes any line exceed its ordered quantity; the UI shows a confirm dialog first:
  «Буюртмадан ортиқ: +N та · +X UZS. Мижоз қарзи шунча ошади.»
- Extra blocks bill at the line's frozen per-block price (owner: full price, as today).
- The order screen shows an **over-load debt** block: extra blocks, extra amount, how much of it is unpaid, and the
  **selling operator** (who placed the order) — the person the owner asks "where is the money". The same figure feeds the
  Stage 2 dashboard (over-load debt per operator).
- New column `GazoblokOrder.createdById` (nullable, backfilled from the `ORDER_PLACED` event's actor) names the selling
  operator.
- A loaded shipment can be corrected (re-loaded) until it is DELIVERED, while the order is open; after the shipment is
  DELIVERED only holders of `order.editShipped` can correct it (still only on an open order). Every correction is logged
  with the before/after counts.
- **Unpaid over-load** = min(over amount, total − confirmed paid): payments cover the ordered blocks first, so the extra
  is the last money in — exactly the amount the selling operator still has to account for.

### 4.5 Every action logged: who, what, date+time

Every state change (place, load, correct, deliver, close short, cancel, payment record/confirm/reject, refund, stock
adjust, production) writes a `GazoblokOrderEvent` (or stock movement) with `actorId` and timestamp, in Uzbek text. The
order screen's history shows «Ким · нима · 10.11.2026 14:32» for every row. (Most events exist today; Stage 1 adds the
missing ones and the who/when display.)

### 4.6 Money safety

- `record_payment`: the remaining-balance check moves inside the transaction under `SELECT … FOR UPDATE` on the order
  (no double payments racing past the ceiling).
- `set_status` and `confirm_payment` take the same lock and re-read the order inside the transaction.
- **Refund owed** mirrors beam-and-block's live overpayment feature: when confirmed paid > total (after cancel, close
  short or a correction lowered the total), the order shows «Қайтариш керак: X UZS»; a refund is recorded as a negative
  confirmed payment by a `payment.confirm` holder, logged with who/when.
- Error messages format money with `formatNumber`.

### 4.7 Permissions — same as beam-and-block

| Gazoblok action | Permission |
|---|---|
| see orders list/detail | `order.view` — sees all orders, same as beam-and-block (owner 2026-11-10: "same permission levels"; `order.viewAll` is unused CRM-wide) |
| place order / reorder | `order.create` |
| shipments: create, load, deliver, correct (before delivered), close short | `order.edit` |
| correct a delivered shipment | `order.editShipped` |
| cancel | `order.cancel` |
| record payment | `payment.record` |
| confirm/reject payment, record refund | `payment.confirm` |
| see stock / production | `inventory.view` |
| adjust stock, log/void production | `inventory.manage` |
| catalog prices | `pricing.edit` (already) |

Pages and sidebar follow the same keys. Before deploy the owner checks which current users lose access (a list is
produced from the users table).

### 4.8 Input and quote fixes

- Wall calculator accepts a decimal comma («7,5» → 7.5 m) everywhere it reads a length.
- Placing an order with an existing client's phone **asks** before renaming that client (keep existing name / update
  name); no silent rename. (Beam-and-block has the same bug; out of scope here, noted for later.)
- The AI agent and the MCP quote use the same estimator as the CRM (`estimateProject`, default joint and orientation),
  so a wall quotes the same block count everywhere; weight uses the shared 611 kg/m³ constant.
- Delivery in quotes: no automatic free-delivery promise; quotes state that delivery is agreed with the operator, and
  orders take the operator's delivery cost.
- Small fixes from the audit: reject archived products on new orders; reject no-op status changes; shipment number
  retry on collision; delivery is a guarded update (no duplicate events); receipt URLs normalised (no `..`).

### 4.9 Existing data (prod) — one-time reconciliation

Switching to per-truck stock means blocks already loaded on **open** orders were never written off. A script
(`scripts/gazoblok-reconcile-stock.ts`) computes, for every non-delivered order with loaded shipments, the movements
needed; runs `--dry-run` by default and prints a per-order, per-size report; `--apply` posts them as
`SHIPMENT_LOAD` movements in one transaction. Delivered orders are left as they are (already decremented).
**Cancelled orders that had trucks loaded** are listed in a separate section and are NOT included in `--apply` unless the
owner names them (`--include-canceled=<orderNumbers>`) — whether those blocks really left the yard is the owner's call.
The owner sees the dry-run report and approves before `--apply`; rollback = the printed inverse movements (the script writes them to
a file). `createdById` backfill runs in the same script.

### 4.10 Tests

Pure logic gets unit tests (quantity model, close-short re-bill, over-load detection, permission map, comma parsing,
estimator parity AI = CRM). Route behaviour is tested through extracted pure helpers in the repo's existing style.
Screens are verified in the browser on an isolated local database, light and dark, phone and desktop, with screenshots
for the owner.

## 5. Calls made by the designer (owner may overrule)

0. Settled from owner rules after the builder check: close short keeps the paid-before-delivered rule (debt stays
   visible on an open order); every hand-over is a shipment; finished orders are final; over-load counts as the last
   money in.

1. Stock moves at **LOADED** (blocks leave the yard), not at shipment DELIVERED.
2. **Close short** re-bills on loaded quantities with the discount pro-rated; delivery cost stays as agreed.
3. Cancel is blocked once anything is loaded (close short instead).
4. Over-load needs an explicit confirmation step; there is no hard cap.
5. Selling operator = whoever placed the order (`createdById`).
6. The decimal-comma and client-rename fixes stay gazoblok-only in Stage 1.
7. Reorder is built in Stage 3 (it is a new feature, not drift); if the owner wants it sooner it moves into Stage 1.

## 6. Non-goals of Stage 1

Dashboard and CRM connections (Stage 2), new features incl. Reorder (Stage 3), Android (Stage 4), the integer-money
refactor (systemic, separate), public `/uploads` gating (separate).
