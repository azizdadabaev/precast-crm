# Gazoblok over-shipment (surcharge) + saved-draft operator column — design

**Date:** 2026-07-24
**Status:** Approved (brainstorming) — pending spec review → writing-plans
**Scope:** two independent features, built as one effort.

---

# Feature A — Gazoblok over-shipment with surcharge

## A.1 Problem

Customers routinely take **more** blocks than they ordered. Today the system
hard-blocks this in two places:

- The load modal (`GazoblokSplitShipmentModal`) shows a blocking red error when a
  line's loaded count exceeds its remaining ordered quantity.
- The server load route rejects `Σ loaded > ordered` per line
  ([load/route.ts:101-107](../../../src/app/api/gazoblok/orders/[id]/shipments/[sid]/load/route.ts)).

And a Gazoblok order's `totalPrice` is **frozen at placement**, so even if
over-shipping were allowed, the amount owed wouldn't move — operators work around
this by typing "+400ta berildi" into order comments.

## A.2 Chosen model — keep the order fixed, add an explicit surcharge

The original order lines (`quantity`, `unitPrice`, `lineTotal`) are **never
rewritten**. Over-shipment is captured as one explicit **surcharge amount** that
raises the payable total. The frozen base stays fully recoverable.

**Pricing identity (new):**
```
base       = linesSubtotal − discountAmount + deliveryCost        // frozen at placement
overship   = Σ_line  max(0, shippedQty(line) − line.quantity) × line.unitPrice
totalPrice = base + overship                                       // payable; grows with overship
```
- `shippedQty(line)` = Σ over all shipments of `loadedLines[line.id]`.
- Over-shipped blocks bill at the **line's frozen `unitPrice`** (placement price).
- `base` is always reconstructible from the still-frozen `linesSubtotal /
  discountAmount / deliveryCost`, so keeping `totalPrice` as the payable (surcharge
  folded in) loses nothing and keeps all payment math single-sourced.

## A.3 Data model

- Add `GazoblokOrder.overshipAmount Decimal @default(0) @db.Decimal(14, 2)` — the
  stored surcharge, for display, events, and audit. (`prisma db push`; prod manual
  push at deploy.)
- No change to `GazoblokOrderLine` (lines stay frozen).

## A.4 Recompute — single source of truth

A pure helper `computeOvership(lines, shipments) → { perLine, overshipAmount }`
recomputes from the order's lines + all shipment `loadedLines`. Called inside the
transaction on **every shipment mutation**: load, load-edit, shipment delete, and
(defensively) delivery. Each recompute updates, atomically:

- `overshipAmount`
- `totalPrice = base + overshipAmount`
- `paymentState` recomputed against the new `totalPrice`, mirroring the floor
  edit-order rule: `confirmedPaid ≥ totalPrice > 0 → FULLY_PAID`, else
  `confirmedPaid > 0 → PARTIALLY_PAID`, else `AWAITING_PAYMENT`. A previously
  FULLY_PAID order that gets over-shipped correctly drops to PARTIALLY_PAID (owes
  the extra). `paidAt` only flips upward, never cleared by a recompute.

## A.5 Load route changes ([load/route.ts])

- **Remove** the over-load guard (lines 101-107) and its `GAZOBLOK_OVERLOAD`
  sentinel/branch. Keep the CANCELED/DELIVERED guards and the `FOR UPDATE` lock.
- After writing `loadedLines`, call `computeOvership` and apply the A.4 updates in
  the same transaction.
- When this load pushed any line over its ordered quantity, add the delta to the
  `SHIPMENT_LOADED` event payload (`overshipDelta`, `overshipAmount`) so the
  activity log shows it.

## A.6 Delivery stock decrement ([orders/[id]/route.ts])

Switch `lineMoves` from ordered quantities to **`max(line.quantity, shippedQty(line))`**
per product. This is deliberately asymmetric: it only ever *adds* the over-shipped
blocks to the stock draw and leaves the normal / under-shipped case exactly as it
is today (still decrements the ordered quantity) — keeping the change surgical.
`decrementGazoblokForOrder` already allows negative stock and returns
`stockWarnings`, which continue to surface the existing negative-stock banner. This
is the "allow + warn" behavior.

## A.7 Load modal changes ([GazoblokSplitShipmentModal])

- Drop the blocking red "exceeds order remaining" error and the disabled submit.
  Allow «қолди» to read negative.
- Render over-shipped lines as a **positive over-ship indicator** (distinct accent,
  not an error), and show a live surcharge preview:
  `Ортиқча · Over-ship: +N блок · +Y сўм`.
- Keep the weight row and the optional loaded-truck photo exactly as-is.

## A.8 Order page display ([gazoblok/orders/[id]/page.tsx])

Add a surcharge line to the financial recap when `overshipAmount > 0`:
```
Буюртма жами · Base        <base>
Ортиқча юклаш · Over-ship   + <overshipAmount>
────────────────────────
Жами · Total               <totalPrice>
```
«Тўлов / Қолди» already derive from `totalPrice`, so they respond automatically.

## A.9 Tests

- `computeOvership` unit tests: no over-ship → 0; single line over → qty×unitPrice;
  multi-line mixed (some under, some over) → only positives counted.
- Load integration: over-ship raises `overshipAmount` + `totalPrice`; a FULLY_PAID
  order flips to PARTIALLY_PAID; deleting the over-shipping shipment restores the
  base total.
- Delivery decrements by shipped (incl. over-ship), emitting a stock warning when
  it drives stock negative.

---

# Feature B — Saved-drafts "Оператор" column

## B.1 Problem

The drafts table ([/projects](../../../src/app/(app)/projects/page.tsx)) can't show
who sourced each draft. `Project` has no creator field — only `aiGenerated`.

## B.2 Data model

- Add `Project.createdById String?` + relation
  `createdBy User? @relation("ProjectCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)`
  and the reverse relation on `User`. Nullable → legacy rows stay valid.
  (`prisma db push`.)

## B.3 Write path

- `POST /api/projects` stamps `createdById = current user id` from the auth cookie.
- The Telegram AI-agent draft-creation path (`persist-quote` / agent order flow)
  leaves `createdById = null` — those rows are already flagged `aiGenerated`.

## B.4 Read + display

- `GET /api/projects` list includes `createdBy: { name }`.
- New **«Оператор · Operator»** column in the drafts table:
  - human draft → operator name;
  - `aiGenerated` → the existing AI badge;
  - legacy/null → «—».

## B.5 Tests

- Creating a draft stamps `createdById`; the list returns the operator name; the
  column renders name / AI badge / «—» across the three cases.

---

# Rollout (both)

- Two additive nullable/defaulted columns (`GazoblokOrder.overshipAmount`,
  `Project.createdById`) via `prisma db push` **before** the app image that uses
  them goes live. Fully backward-compatible: existing orders read `overshipAmount = 0`
  (unchanged totals) and existing drafts read `createdById = null` («—»).

# Out of scope

- Over-shipping a product **not** already on the order (over-ship is more of an
  existing line only).
- Editing frozen order lines / re-pricing at current catalog price (over-ship uses
  the line's placement `unitPrice`).
- Backfilling operator attribution on historical drafts.
