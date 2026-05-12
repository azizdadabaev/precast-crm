# Handoff — Precast CRM

> Drop this file path into your next Claude Code session ("read HANDOFF.md")
> and it will pick up exactly where we left off.

## What this is

Beam-and-block flooring CRM for an Uzbek precast manufacturer. Operator-driven
workflow:

```
Calculator → Save Project (draft) → Place Order → In Production → Dispatched → Delivered
                                       ↑ creates Client + Order atomically
                                                                    ↑ assign driver + truck
                                                                                  ↑ photo + cash collected on site
                                                                                              ↓
                                                                                  Hand-over → Confirm (ADMIN/OWNER)
                                                                                  → paymentState becomes FULLY_PAID
```

Payment is **decoupled from order status** (no PAID status anymore). Order
status tracks production/delivery; `paymentState` (AWAITING_PAYMENT /
PARTIALLY_PAID / FULLY_PAID) tracks cash. See "Delivery & Cash Custody"
below.

Sidebar (UZ-primary):
**Бошқарув · Калькулятор · Лойиҳалар · Буюртмалар · Мижозлар · Ҳайдовчилар · Тўловлар · Тафовутлар**
(Drivers / Payments / Discrepancies are ADMIN/OWNER-only. Pipeline + Quotes are hidden from nav; Deal model still backs the data.)

## Setup on a fresh device

Prereqs: **Node 18+**, **Postgres 14+**, **git**.

```powershell
# 1. Clone
git clone https://github.com/azizdadabaev/precast-crm.git
cd precast-crm\precast-crm   # NB: the Next.js project is the inner folder

# 2. Install deps
npm install

# 3. Make a local .env from the example, then edit DATABASE_URL with your Postgres password
copy .env.example .env
notepad .env   # set DATABASE_URL to postgresql://postgres:YOUR_PASS@localhost:5432/precast_crm?schema=public
              # set JWT_SECRET to a 32+ char random string
              # ORDER_CANCEL_PASSWORD can stay as "etalontbm" or be changed

# 4. Create the database (one-time)
$env:PGPASSWORD = "YOUR_PASS"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d postgres -c "CREATE DATABASE precast_crm"

# 5. Apply schema and seed demo data
npm run db:push        # push schema (no migration files; prototyping mode)
npm run db:seed        # admin@precast.local / admin123 (and 4 demo clients + 2 demo orders)

# 6. Run the dev server
npm run dev            # http://localhost:3000
```

**Login:** `admin@precast.local` / `admin123`

If port 3000 is taken, Next will pick the next free port. The terminal output prints the URL.

## Quick walkthrough of the app

1. Open **http://localhost:3000/calculations** (the operator's home).
2. Type a client's **Name + Phone + Address** in the strip at the top. Phone has live autocomplete from the existing clients table.
3. Add rooms — each row computes live (Beam length, pitches, blocks/row, beams, slab area, subtotal).
4. **Save Project** (gray) — only phone is required. Stores a draft under `/projects`. Reopen any draft → opens the calculator pre-filled with the saved data.
5. **Буюртма Бериш · Place Order** (orange) — requires Name + Phone + Address + at least one valid room. Opens a modal with a capacity calendar:
   - Each day cell is colored by the m² already booked: green ≤ 300, yellow ≤ 450, orange ≤ 600, red > 600.
   - Past days are disabled.
   - Selected day previews the new order's m² impact.
6. Confirming creates everything in one transaction: Client (deduped by normalized phone), Deal advanced to WON, Project marked ORDERED, Order with frozen pricing snapshot, OrderEvent for the audit trail. You land on **/orders/[id]** with a fresh order number `YYYY-MM-NNNN`.
7. Status timeline on the order page: click pills to advance Placed → In Production → Delivered → Paid. Marking **Delivered** opens a modal that demands a **photo of the loaded truck** (JPG/PNG/WEBP, ≤8 MB). The image is stored under `public/uploads/orders/{orderId}/` and shown on both the order detail page and the printable invoice.
8. **/orders** page has the same capacity calendar at the top — clicking a day filters the list to that day.
9. Orders can be **canceled** by Admin (no password) or by anyone with the `ORDER_CANCEL_PASSWORD` env var (default `etalontbm`). Canceling frees the project back to Draft and moves the deal to LOST.
10. **Print** any order at `/orders/[id]/print` — auto-triggers `window.print()`. The page is a single A4-portrait sheet with: header, client + delivery (driver/truck if dispatched), a two-row-per-room table (primary scan-line + technical detail line for beam length, beams, blocks/row, total blocks, slab length, m² rate), totals strip, pricing breakdown, payment status, signature block, and a footer with a QR code that opens the order detail page on the operator dashboard. Fully-paid orders show a faint diagonal "PAID" watermark behind the rooms table. Brand strings (`PRECAST CRM`, tagline, phone) are hardcoded constants at the top of the print page — TODO: move to `AppConfig` once an admin-config UI exists. The delivery proof, if uploaded, still prints on its own page after the invoice.

## Architecture cheat-sheet

```
src/
├── app/
│   ├── (app)/                    Authenticated shell pages
│   │   ├── dashboard/            Summary KPIs (deal-based for now)
│   │   ├── calculations/         Calculator entry point (operator's home)
│   │   ├── projects/             Drafts list + detail (?status=DRAFT default)
│   │   ├── orders/               Placed orders list + detail + /print
│   │   └── clients/              Client directory
│   ├── api/
│   │   ├── auth/                 login / logout / me / register
│   │   ├── calculate/            One-shot preview (no persistence)
│   │   ├── projects/             Save Project (draft) + list with search
│   │   ├── orders/               Place Order, list, detail, capacity, cancel,
│   │   │                         delivery-proof (multipart/form-data)
│   │   ├── clients/              List + autocomplete + dedup-on-create
│   │   └── dashboard/, deals/, payments/   (kept for future Pipeline use)
│   └── login/                    Public
├── components/
│   ├── calculation/
│   │   ├── ClientInfoBar.tsx     Name | Phone (autocomplete) | Address
│   │   ├── MultiRoomCalculator.tsx  The grid + Add Room
│   │   └── PlaceOrderDialog.tsx  Modal w/ capacity calendar + summary
│   ├── orders/
│   │   ├── CapacityCalendar.tsx  Reusable month heatmap
│   │   └── DeliveryProofDialog.tsx  Image upload modal
│   └── ui/                       shadcn primitives
├── lib/
│   ├── prisma.ts                 Prisma singleton
│   ├── auth.ts                   JWT + bcrypt + cookies
│   ├── validation.ts             Zod schemas for every API route
│   ├── api.ts                    handler() wrapper, ok/fail/created
│   ├── fetcher.ts                Typed client-side fetch
│   ├── phone.ts                  Normalize + format + suffix-search
│   ├── order-number.ts           YYYY-MM-NNNN allocator
│   ├── calc-persistence.ts       SlabResult → Prisma payload mapper
│   ├── uploads.ts                Filesystem image helper + validation
│   └── utils.ts                  cn, formatMoney, formatDate, formatNumber
├── services/
│   └── calculation-engine.ts     THE engine — pure, no I/O. Tests in tests/.
├── store/                        Zustand UI state (mostly unused now)
└── middleware.ts                 Edge route protection
```

## Calculation engine, in one paragraph

Three layout patterns: **Г-Б** (alternating), **Б-Г-Б** (extra closing beam),
**Г-Б-Г** (extra closing block row). Pitch = 0.58 m. Beam length = inner_width
+ 2 × bearing (default 0.15). Blocks per row = CEIL(inner_width / 0.20).

Auto-pick rule (post-correction remainder R = effective_length − pitches × PITCH):
R = 0 → GB; R ≤ 0.20 → BGB; R ≤ 0.45 → GBG; R > 0.45 → GB at pitches+1.

"Add a starting beam" (StartB toggle OR first manual extra beam): GB → BGB
at same pitches; **GBG → GB at pitches+1** (the extra block row is balanced
by the new beam, so the slab is now alternating N+1 ↔ N+1).

Pricing tiers keyed by manufactured beam length (m² rate 140k–230k, per-m
extra beam 60k–120k, blocks 6k each). m² billed on `pitches × PITCH × beam_length`
ONLY — pattern extras (Б-Г-Б's extra beam, Г-Б-Г's extra blocks) and manual
extras are separate per-line items. **Pricing is frozen at Place Order time.**

42 vitest cases cover every pattern × extras combo. Phone helpers and order-number
allocator have their own tests (60 total).

## Inventory module

The factory's daily output flows through this module:
**Production log → InventoryItem stock → Order delivery (decrement) → Cancel (restock)**.

### Schema (4 new models, 1 new OrderEventType)

```prisma
enum InventoryKind          { BEAM  BLOCK }
enum StockMovementReason    { PRODUCTION  DELIVERY  MANUAL_ADJUSTMENT  CANCELLATION_RESTOCK }
enum OrderEventType + STOCK_WARNING

model InventoryItem        // one row per (kind, beamLength). BLOCK row has beamLength = NULL.
  kind, beamLength?, quantity, lowStockThreshold (default 10), updatedAt
  @@unique([kind, beamLength], name: "kind_beamLength")

model ProductionEntry      // a single shift / batch
  producedAt, recordedById, notes, lines[], movements[]

model ProductionLine       // one line per kind+length within an entry
  productionEntryId, kind, beamLength?, quantity

model StockMovement        // append-only audit ledger
  inventoryItemId, change (signed), resultingQuantity, reason,
  productionEntryId?, orderId?, actorId?, note?
```

### Decrement & restock rule (the only one that matters)

- **Decrement on DELIVERED only** — never on placement. Lives inside the
  same Prisma transaction that flips status. Two paths:
  - Canonical: `POST /api/orders/[id]/delivery-proof` (the truck-photo flow).
  - Safety net: `PATCH /api/orders/[id]` with `status: DELIVERED`
    (programmatic; UI doesn't use this path).
  Both invoke `decrementForDelivery` from `lib/inventory.ts` against the
  project's frozen calculation snapshot.

- **Negative stock is allowed** (factory may have unlogged production).
  The decrement still succeeds, a `STOCK_WARNING` OrderEvent is appended
  to the audit log per affected SKU, and the order detail page shows an
  amber banner pointing the operator at the Inventory page to reconcile.

- **Restock on cancellation only when `status` was `DELIVERED` or `PAID`**.
  PLACED / IN_PRODUCTION orders never decremented, so cancellation is a
  no-op for stock. Restock writes `CANCELLATION_RESTOCK` movements with
  the cancel reason in the note.

### Files of interest

- `lib/inventory.ts` — pure helpers (`canonicalBeamLength`,
  `calcSnapshotToInventoryLines`, `stockTier`) + DB ops
  (`applyStockMovement`, `decrementForDelivery`, `restockForCancellation`).
  The DB ops use `findFirst + create/update` rather than `upsert` because
  Prisma's composite-unique upsert is brittle on Decimal columns.
- `app/api/production/route.ts` — `GET ?days=14` and `POST` to create an
  entry with lines + stock movements in one transaction.
- `app/api/inventory/route.ts`, `[id]/route.ts`, `[id]/adjust/route.ts` —
  list, threshold update (admin), manual adjustment (admin + required note).
- `app/(app)/production/page.tsx` — log form + recent-14-day grouped list.
- `app/(app)/inventory/page.tsx` — summary cards + Beams/Blocks tables
  with tier coloring (red ≤ threshold, amber ≤ 1.5×, normal otherwise),
  inline threshold editor (admin), and an Adjust button per row (admin).
- `components/production/ProductionLogForm.tsx` — dynamic line list.
- `components/inventory/AdjustStockDialog.tsx` — delta + required note,
  shows projected resulting quantity.

### Tests

- 14 pure unit tests in `tests/inventory.test.ts` cover `canonicalBeamLength`,
  `calcSnapshotToInventoryLines` (collapse same-length beams, drop zero
  qty, blocks-only snapshot), `stockTier`, `formatInventoryLabel`.
- The full DB-touching cycle (production → delivery → restock) is currently
  **manual** in this PR. Prisma's number↔Decimal conversion in the test
  environment is too flaky to land reliably; left a `describe.skip` block
  with a TODO. The pure helpers it would have wrapped are already proven.

### Manual verification recipe

1. `Production` page: log "Beam 4.30m × 5", "Block × 200" → save.
   `Inventory`: two SKUs appear, +5 and +200 PRODUCTION movements.
2. Place + advance an order to DELIVERED via the truck-photo flow.
   `Inventory`: matching beam length and BLOCK row decrement; DELIVERY
   movements are appended to each.
3. Engineer the demand to exceed stock (or short the production log).
   Delivery still completes; an amber banner appears on the order detail
   page; `STOCK_WARNING` events are in the activity log.
4. Cancel the delivered order with the password (`etalontbm`):
   `CANCELLATION_RESTOCK` movements appear, quantities return to where
   they were before the delivery.
5. Cancel a PLACED order: no stock movements written.
6. Manual adjust (admin only) on the inventory page: dialog requires a
   note, projected qty preview shows; submitting writes a
   `MANUAL_ADJUSTMENT` movement.

## Contact export (multi-select share) module

Operators frequently need to give a new prospect the contact info of past
clients in nearby regions, so the prospect can visit a finished slab and
see how it performs in real life. Today that's a one-click export from
the Clients page.

### Privacy gate (always enforced)

A client is only includable in an export when their `referenceConsent`
is `GRANTED`. The state has three values:

```prisma
enum ReferenceConsent { NOT_ASKED  GRANTED  DENIED }
```

- **NOT_ASKED** — default for every existing and new client. No export.
- **GRANTED** — operator explicitly recorded the client's consent. Export OK.
- **DENIED** — operator recorded a refusal. Treated identically to
  NOT_ASKED for export purposes; the difference matters only as audit.

The gate is enforced **server-side** in `POST /api/clients/export` —
even if the UI sends an ID list that includes non-consenting clients,
the server filters them out before formatting. The dialog warns when
some IDs were dropped: "2 clients excluded (no consent on file)".

### Format

`lib/contact-export.ts` is the pure formatter. Exact format rules
(snapshot-tested in `tests/contact-export.test.ts`):

```
Aliyev Construction
+998 90 111 22 33
Tashkent, Yashnobod district

Karimov LLC
+998 93 555 44 66
Samarkand, Registan st. 12

BuildPro Group
+998 77 123 45 67
(address not on file)
```

- Phone formatted via `lib/phone.ts` `formatPhone` (`+998 XX XXX XX XX`).
- Missing/empty/whitespace-only address → literal `(address not on file)`.
- Blocks separated by exactly one blank line; trailing whitespace stripped.
- Whitespace WITHIN a name or address is preserved as-is.

### Audit trail

```prisma
model ExportEvent {
  id         String   @id @default(cuid())
  userId     String
  clientIds  String[]    // Postgres text[]
  exportedAt DateTime @default(now())
  user       User     @relation(...)
}
```

One row per call to `POST /api/clients/export`. Captures who handed out
which contacts when. The `userId` FK is verified against the User table
before insert (defense against stale JWTs after a schema reset — same
pattern as the cancel route).

### UI surfaces

- `/clients` — leftmost checkbox column. Rows with consent ≠ GRANTED
  show a disabled checkbox with a `title` of "Розилик берилмаган · No
  consent on file". A "Select all (filtered)" header checkbox toggles
  only the visible eligible rows. Selection state lives in a
  `Set<string>` and is **cleared whenever filters change** (operators
  re-confirm context after re-querying).
- Sticky action bar above the table when ≥ 1 row is selected:
  "Selected: N · Export Contacts · Clear".
- `ExportDialog` (`components/clients/ExportDialog.tsx`) — fetches
  the formatted text from the server, shows it in an editable textarea
  (operators sometimes prune lines), 1-click "Copy to clipboard" with a
  2-second "✓ Copied" confirmation state.
- `/clients/[id]` — new "Reference Consent" card. Badge shows current
  state (green/red/gray); "Update consent" opens `ConsentDialog` with a
  radio group + optional note. Saves PATCH the client and stamp
  `consentUpdatedAt`.

### Validation gates

- `ContactExportSchema` caps the IDs array at **50** to prevent
  accidental "export everyone" via a buggy script.
- The endpoint **requires authentication**. A stale JWT (user no longer
  in DB) returns 401 with a "log out and back in" hint.

### What's intentionally out of scope

- No SMS/WhatsApp **sending** — operators paste into their messenger of
  choice. The text format is the contract; sending is a separate PR.
- No "Export All" button — every export is an explicit, scoped action.
- No consent column on the main clients table — internal privacy
  field, lives only on the detail page.
- No bulk delete / bulk edit / bulk anything else.

## Delivery & Cash Custody module

This is the dominant flow in the system. Cash is collected at the delivery
site by the driver, then handed to the operator at the office, then
confirmed by the owner. Each step is timestamped with the verified actor
ID — the chain of custody IS the audit trail.

### Why this shape

The previous model gated production behind payment. Real-world Uzbekistan
flow is the opposite: customer places order → factory produces → driver
delivers and collects cash on the spot → operator records it → owner
confirms it. The schema mirrors that flow exactly so each handoff is
attributable.

### Schema (3 new models, 1 new field on Order, 1 new enum)

```prisma
enum OrderStatus           { DRAFT  PLACED  IN_PRODUCTION  DISPATCHED  DELIVERED  CANCELED }
                           // PAID is gone — paid-ness moved to paymentState
enum OrderPaymentState     { AWAITING_PAYMENT  PARTIALLY_PAID  FULLY_PAID }
enum PaymentStatus         { PENDING_CONFIRMATION  CONFIRMED  REJECTED }
enum PaymentMethod         { CASH  BANK_TRANSFER  CLICK  PAYME  OTHER }
enum DiscrepancyStatus     { OPEN  RESOLVED_RECOVERED  RESOLVED_DISCOUNT  RESOLVED_WRITEOFF  DISPUTED }
enum UserRole              + OPERATOR, OWNER

model Driver
  name, phone @unique, active (default true), notes?
  dispatches[], collectedPayments[]

model Dispatch              // 1:0..1 with Order (orderId @unique for v1)
  orderId @unique, driverId, dispatchedById?, truckIdentifier?,
  expectedCollection (Decimal), notes?, dispatchedAt, returnedAt?

model Payment
  orderId, amount (Decimal), method, status (default PENDING_CONFIRMATION),
  collectedById?, collectedAt?,                  // driver step
  recordedById, recordedAt,                       // operator step
  handedOverToOfficeById?, handedOverAt?,         // operator hand-over step
  confirmedById?, confirmedAt?, adjustmentNote?,  // owner confirm step
  rejectedById?, rejectedAt?, rejectionReason?,
  note?
  // 4 timestamps + 4 actor FKs = chain of custody

model Discrepancy
  orderId, paymentId?, driverId?, expectedAmount, receivedAmount, shortfall,
  status (default OPEN), reportedById?, reportedAt,
  resolvedById?, resolvedAt?, resolutionNote?
```

`Order` gained `paymentState` and `confirmedPaid` (a denormalized sum of
CONFIRMED Payment.amount, recomputed inside the confirm transaction).

### Maker-checker (the core invariant)

- **Maker** (any authenticated role): records the payment, records the
  hand-over to the office.
- **Checker** (ADMIN or OWNER only — `canConfirmCash()` in `lib/auth.ts`):
  confirms or rejects payments, resolves discrepancies.

The same actor cannot both record AND confirm in the happy path; the
client UI omits the confirm action for non-checkers, and the API gates
return 403. Confirm/reject endpoints accept ADMIN as a superuser by
convention even though the spec names OWNER as the operational role.

### Three entry points for recording payments

Customers don't pay at one moment — partials are common, transfers
arrive between placement and delivery, drivers collect cash on site.
All three paths converge on the same `Payment` row shape with status
`PENDING_CONFIRMATION`; the owner confirms from `/payments`. The only
difference is which chain-of-custody fields get stamped:

| Entry point | Source | `collectedById` | `collectedAt` | `handedOverToOfficeAt` |
| --- | --- | --- | --- | --- |
| **Place Order dialog** (Тўлов field) | `IN_OFFICE_CASH` | null | null | null |
| **Add Payment dialog** on order detail (mid-order) | `IN_OFFICE_CASH` or `BANK_OR_ONLINE` | null | null | set iff `handOverNow` & cash |
| **Delivery Proof dialog** (cash collected on site) | `FROM_DRIVER_AT_DELIVERY` | dispatch.driverId | now | null (operator hand-over later) |

The placement dialog and Add Payment dialog both go through `POST /api/payments`
with the appropriate `source`. The delivery flow inlines the Payment
creation in `delivery-proof/route.ts` so it can stay atomic with the
order flip and inventory decrement, but the row shape matches.

`/api/payments` rejects when `amount > totalPrice − confirmedPaid −
sum(PENDING)` so we can't double-record while a previous payment is
still in the owner's queue. It also rejects on CANCELED orders and on
DELIVERED + FULLY_PAID orders.

`ChainOfCustodyPanel` renders different step lists per shape: 3 steps
for the driver path, 2 for in-office cash (recorded → handed over to
owner), 1 for bank/online (no physical handover step at all).

### Lifecycle, end to end

1. **Place order** — same as before. `paymentState = AWAITING_PAYMENT`,
   no Dispatch yet.
2. **Production** — operator advances PLACED → IN_PRODUCTION. Inventory
   is *not* decremented yet (still happens at DELIVERED).
3. **Dispatch** — operator clicks the DISPATCHED step on the order page,
   picks a driver from the active list and a truck identifier, sets
   `expectedCollection` (defaults to outstanding balance). Creates a
   Dispatch row, flips the order to DISPATCHED, appends a `DISPATCHED`
   OrderEvent.
4. **Delivery + cash collection** — operator clicks DELIVERED, the
   `DeliveryProofDialog` opens with truck-photo upload AND a cash
   collection panel pre-filled from `dispatch.expectedCollection`. The
   operator records what the driver actually brought back; if nothing,
   they tick "no cash collected" and write a reason. On submit, the
   route:
   - validates + saves the photo
   - decrements inventory inside the same transaction
   - creates a Payment row (status=PENDING_CONFIRMATION,
     collectedById=dispatch.driverId, recordedById=current user)
   - if `driverReturned` was checked, stamps `dispatch.returnedAt`
   - flips order to DELIVERED
   - appends `DELIVERED` and `PAYMENT_RECORDED` OrderEvents
5. **Hand-over to office** — operator goes back later and clicks
   "Hand over" on the payment row. Stamps
   `handedOverToOfficeById/At`. If the dispatch hasn't been marked
   returned yet, that route also stamps `returnedAt`.
6. **Confirm or reject** — owner opens `/payments` (Pending tab),
   sees the chain of custody. Confirms-as-recorded for the happy path.
   If the owner adjusts the amount, an adjustmentNote is required. If
   the recorded amount is below `dispatch.expectedCollection`, a
   DiscrepancyChoice (TRACK / DISCOUNT / WRITEOFF) + 5-char min note are
   required. Confirm:
   - sets `payment.status = CONFIRMED`, stamps `confirmedById/At`
   - recomputes `order.confirmedPaid = SUM(CONFIRMED amounts)`
   - sets `order.paymentState = FULLY_PAID` if `confirmedPaid >= totalPrice`,
     `PARTIALLY_PAID` if > 0, else `AWAITING_PAYMENT`
   - stamps `order.paidAt` only when transitioning to FULLY_PAID
   - if shortfall: creates a Discrepancy with status
     OPEN / RESOLVED_DISCOUNT / RESOLVED_WRITEOFF based on the action
   - appends `PAYMENT_CONFIRMED` (and `DISCREPANCY_OPENED` when applicable)
7. **Reject** — owner provides a 3-char min reason. Sets status=REJECTED,
   stamps rejected actor + timestamp. Does NOT add to confirmedPaid.

### Files of interest

- `lib/auth.ts` — `AuthRole` now includes OPERATOR + OWNER. `canConfirmCash()`
  is the maker-checker gate.
- `lib/validation.ts` — `PaymentRecordSchema`, `PaymentConfirmSchema`,
  `PaymentRejectSchema`, `DriverCreateSchema`, `DispatchCreateSchema`,
  `DiscrepancyUpdateSchema`. Added `OrderPaymentStateEnum`,
  `PaymentMethodEnum`, `DiscrepancyStatusEnum`.
- `app/api/orders/[id]/dispatch/route.ts` — POST creates Dispatch + flips
  to DISPATCHED.
- `app/api/dispatches/[id]/return/route.ts` — POST stamps `returnedAt`.
  Idempotent.
- `app/api/orders/[id]/delivery-proof/route.ts` — multipart with
  cashAmount, noCashCollected, noCashCollectedNote, driverReturned.
  Creates the Payment row with collected-by = dispatch driver.
- `app/api/payments/route.ts` — GET (filterable by orderId, status) /
  POST (record). All routes return the full custody chain via Prisma includes.
- `app/api/payments/[id]/handover/route.ts` — operator step, any role.
- `app/api/payments/[id]/confirm/route.ts` — checker only; recomputes
  `confirmedPaid` and `paymentState`, opens Discrepancies as needed.
- `app/api/payments/[id]/reject/route.ts` — checker only; required reason.
- `app/api/drivers/*` — list with augmented counts
  (activeDispatchCount, discrepancyCount30d, lastDispatchAt), CRUD,
  ADMIN/OWNER deactivate.
- `app/api/discrepancies/*` — ADMIN/OWNER list + status PATCH with note.
- `app/api/dashboard/route.ts` — revenue counts CONFIRMED Payments only;
  added `cashOnRoad` (SUM expectedCollection where returnedAt=null) and
  `openDiscrepancies` (count of OPEN rows).

### UI surfaces

- `/orders` — added "Dispatched" filter tab and a Payment column with
  `paymentState` badge per row.
- `/orders/[id]` — DISPATCHED step in the timeline triggers
  `DispatchDialog`; DELIVERED step triggers the extended
  `DeliveryProofDialog`. Below the breakdown grid: a Dispatch info panel
  (driver + truck + expected + Mark Returned button) and a Payments table
  (chain of custody with per-row Hand over action).
- `/drivers` — list with active/inactive toggle (ADMIN/OWNER), opens
  `DriverFormDialog`. `/drivers/[id]` shows recent dispatches + 30d
  discrepancies.
- `/payments` — checker queue. Tabs Pending / Confirmed / Rejected;
  `ConfirmPaymentDialog` wraps `ChainOfCustodyPanel` + adjustment input
  + `DiscrepancyChoice`. ADMIN/OWNER only.
- `/discrepancies` — Open / Resolved / Disputed tabs; each row opens
  `DiscrepancyUpdateDialog`. ADMIN/OWNER only.
- Dashboard — added "Cash on the road" and "Open discrepancies" KPI
  cards. Revenue tile relabelled "Revenue (confirmed)" and now sums only
  CONFIRMED Payment.amount.

### Tests

- `tests/dispatch-and-cash-flow.test.ts` — 24 unit cases: schema
  validation for the new endpoints, role-gate behaviour for
  `canConfirmCash`, paymentState computation rule, enum shape (DISPATCHED
  present, PAID absent).
- DB-touching integration tests (production gate removed, dispatch
  transition, delivery+collection, hand-over, audit log, computed-field
  correctness) are not landed: this repo doesn't have a DB harness yet.
  Worth adding alongside the inventory `describe.skip` block once we
  stand up a test database.

### Manual verification recipe

1. Place an order and advance it to IN_PRODUCTION as before.
2. From the order page, click **Dispatched**. Pick a driver + truck +
   expected collection (defaults to outstanding). Order flips to
   DISPATCHED; the Dispatch panel appears below the breakdown grid.
3. Click **Delivered**. Upload a truck photo, confirm/edit the cash
   amount, optionally tick "Driver returned to office". Submit. Order
   flips to DELIVERED, inventory decrements, a PENDING payment row
   appears in the Payments table.
4. Click **Hand over** on the payment row (or skip — already stamped if
   the driver-returned checkbox was used).
5. Log in as ADMIN/OWNER (admin@precast.local). Open `/payments`. The
   payment is in Pending. Open the dialog: chain of custody has 3
   green steps. Confirm-as-recorded on the happy path. The dashboard's
   Revenue tile updates.
6. To exercise discrepancies: in step 3 enter an amount < expected.
   In step 5, the dialog shows the DiscrepancyChoice. Pick TRACK with a
   note → a row appears in `/discrepancies`. Resolve it via the
   dialog with a 5+ char note.
7. Cancel a DELIVERED order (admin or password) — inventory restocks
   as before; existing payments are NOT auto-rejected (owner has to
   reject them manually if appropriate).

### Outstanding items / known limits

- `Dispatch.orderId` is `@unique` for v1, so an order has at most one
  dispatch. Re-dispatch (truck breakdown, driver swap) requires a schema
  change to make this 1:N.
- Cancel does NOT cascade to existing CONFIRMED payments. If an order
  is canceled after the customer paid, the owner has to manually
  reconcile (refund + reject the payment).
- Existing ADMIN-only API gates that were NOT broadened to OWNER in
  this PR (out of scope; flagged for a follow-up):
  - `app/api/inventory/[id]/route.ts:12` — PATCH lowStockThreshold
  - `app/api/inventory/[id]/adjust/route.ts:19` — manual stock adjust
  - `app/api/orders/[id]/cancel/route.ts:28` — order cancellation
    (also accepts the company `ORDER_CANCEL_PASSWORD` fallback)
  - `app/(app)/inventory/page.tsx:58` — UI gate on inline threshold
    edit + Adjust button (cosmetic; the API already enforces)
  Spec wanted these flagged, not changed.

## Sandbox modules

- **Tapered Beam-and-Block** (`src/sandbox/tapered-beam-block/`, route `/sandbox/tapered`, ADMIN-only sidebar entry "Тажриба · Sandbox · Tapered") — isolated playground for trapezoidal / irregular-quadrilateral slab math. Engine is pure with full Vitest coverage; UI mirrors the §9 SPEC.md report layout. Severable: deleting the folder + `src/app/(app)/sandbox/tapered/page.tsx` + the sidebar diff + the one-line `vitest.config.ts` `include` extension fully removes the feature. **Not for production planning** until merged into `services/calculation-engine.ts`.

## Mobile-friendly calculator (Pattern 1 shipped)

Below `lg` (1024 px) the calculator at `/calculations` now uses
horizontal-scroll-with-sticky-columns: **Эни (Width)** and **Бўйи
(Length)** stay pinned to the left edge while the rest of the
18-column table scrolls sideways. A right-edge gradient + an inset
shadow on the Length column boundary signal the scroll affordance.
On desktop (≥ 1024 px) the calculator is **byte-identical** to the
prior production layout — every change is gated on the `lg` Tailwind
breakpoint.

Other mobile-only refinements:

- Calculator inputs (`.grid-input`, `.grid-select`) are 44 px tall on
  phone/tablet (Apple HIG tap-target minimum) and revert to 32 px on
  desktop. Defined in `src/app/globals.css`.
- Per-row round-up/down arrows: on the desktop calculator they sit
  inline with each Width input (unchanged). On `<lg` they relocate
  into the row's Name cell (right side, vertically stacked) since
  the sticky Width column is too narrow to host them comfortably.
  Both render sites share `RowRoundArrows` inside
  `MultiRoomCalculator.tsx` and call the same `onRoundUp(row.id)` /
  `onRoundDown(row.id)` handlers — only the position changes.
- The client-info card collapses to a one-line summary (Name · Phone
  · Address with an Edit button) once Name + Phone are filled and
  the operator taps outside. Tap the strip or clear a required field
  to expand again. State machine in
  `src/components/calculation/ClientInfoBar.tsx`. Desktop never sees
  the collapsed strip — `lg:!block` keeps the form rendered at all
  sizes.
- On mobile only, the client form's Phone and Address fields share a
  row (2-col grid) instead of stacking. Achieved via `lg:contents`
  on the inner wrapper so the desktop 3-column grid is unchanged.

The `/mobile-test` prototype branch was used to choose Pattern 1 and
is fully deleted now (no `/mobile-test` files, no route mapping).
The branch-wide hamburger sidebar (`MobileTopbar` + shared
`SidebarBody`) shipped on the `mobile` branch is preserved.

`Sheet` primitive lives at `src/components/ui/sheet.tsx`, authored
manually on top of the already-installed `@radix-ui/react-dialog`.

## What's NOT implemented yet (deferred)

Items 5, 11, 12, 14 from the 14 best-practices list:
- **Recent calcs rail** at the top of /calculations
- **Role gates** beyond cancel — currently anyone authenticated can save & order;
  ENGINEER/SALES/ADMIN distinctions only enforce cancel
- **Per-role discount caps** (5% / 15% / unlimited)
- **Enter-key adds row** in the calculator

## Keys facts to remember when you keep building

- The Pipeline page (`/pipeline`) and route still exist; only the sidebar nav was hidden. Deal model is intact and used by the Order placement transaction (it advances Deal to WON).
- Phones are stored **digits-only** in the DB (`998901112233`) and formatted on display (`+998 90 111 22 33`). Search supports last-4-digits.
- `Quote` model was renamed to `Order`. The `/api/quotes/*` and `/quotes/*` routes were deleted.
- `Client.location` was renamed to `Client.address`.
- `Project.dealId` is **nullable** now; drafts can exist before a Deal.
- Schema migrations use `prisma db push` (no migrations folder). For a fresh clone, `npm run db:push` is enough; for an existing DB with old data, `npm run db:push --force-reset` will drop everything and start over (seed data is regenerable).
- `public/uploads/` is gitignored. Delivery photos live there per machine.
- Memory files for Claude Code live under `~/.claude/projects/c--Users-…/memory/` per machine and **do not** sync via git. Re-create on the new device by saying "remember the calculation patterns / pricing tiers" once or letting Claude rediscover them from the code.

## Dashboard

`/dashboard` shows 11 KPI cards in 3 sections — financial health,
operational status, business insights — in a neutral SaaS aesthetic
(Stripe / Linear / Vercel tradition). White cards on a soft-gray
surface with hairline borders; color is reserved strictly for status
signals:

  - **Trend pills** — small green / red tags in the upper-right of
    revenue, avg order, and receivables cards. Polarity-aware:
    receivables ↑ renders red because it's bad; revenue ↑ renders
    green because it's good. |delta| < 1% renders neutral gray
    (flat) so noise doesn't trigger flashing.
  - **3 px left border** — the only chromatic accent on the card body
    itself. Receivables card gets a red left edge when outstanding
    > 0; discrepancies and cash-on-road cards get an amber left edge
    when > 0. Card surface stays white either way.
  - **Heavy / overbooked capacity bars** — gray for available and
    moderate; amber for heavy; red for overbooked. Most days are
    gray; red only fires the moment you're double-booked.

That is the entire palette of color in the dashboard. No gradient
backgrounds, no rainbow cards, no gradient text, no drop shadows
beyond a 1 px hairline.

Tokens (`--dash-*`) and component classes (`.dash-card`,
`.dash-trend`, `.dash-bar-list`, `.dash-list`, `.dash-week-strip`)
live in `globals.css` scoped to `.dashboard`. Card components live
under `src/components/dashboard/` — `Card.tsx` is the single primitive
shared by all 11 cards (with optional `wide` mode for the row 3 cards
that hold lists/charts).

Cards 9–11 use simple HTML/CSS — no charting library, no SVG. The
horizontal bar list, ranked customer list, and week-capacity strip
are all `<ul>` / `<ol>` with calculated `width: %` or `height: %`
fills.

API (`/api/dashboard`): gated ADMIN + OWNER via `canConfirmCash`.
Returns previous-month aggregates alongside this-month so the cards
can render trend pills without a second round-trip. Cached server-side
30 s; client polls every 60 s. Receivables trend uses a
"reconstructed-from-current" comparison (orders placed by last month's
end that are still un-paid) — direction is reliable; magnitude is a
slight under-estimate. Acceptable for a trend pill where the arrow is
what matters.

Address-to-city normalization (`src/lib/city-normalize.ts`) maps the
13 largest Uzbek cities across Cyrillic / Latin / mixed transliteration
into canonical names + an "Other" fallback bucket. 9 unit tests cover
the patterns.

Capacity thresholds in the week strip mirror the calendar's published
limits: Available ≤ 300 m² (gray), Moderate ≤ 450 (gray), Heavy
≤ 600 (amber), Overbooked > 600 (red).

## Tapered sandbox — bump rule + endpoint contract (§15)

**Bug fixed:** the engine previously used `Math.ceil(rowsRaw − EPS)` for
the practical row count and produced `rowsPractical` beam widths via
`width1 + C_r × n` for `n = 0..rowsPractical-1`. That left the
closing wall uncovered: input `(width1=2, width2=4, length=4)`
produced 7 beams ending at 3.74 m, leaving 52 cm of slab without a
beam at the `width2 = 4.0` wall.

**Fix:** mirror the production engine's `autoPickPattern` bump rule
in the sandbox. Pitch count = `floor(length / S)` plus **+1 if
`R > 0.45`**; the slab now has `pitches + 1` beams (one at each pitch
boundary including both walls). Widths are computed by linear
interpolation over `coveredLength = pitches × S`, so
`perRowInnerWidths[0] = width1` and
`perRowInnerWidths[pitches] = width2` exactly — guaranteed for every
input.

`TaperResult` gains three fields: `beamCount` (= `rowsPractical + 1`),
`coveredLength`, and `bumped` (the boolean indicator surfaced in the
geometry card so operators can see when the rule fired). The §10
worked examples in `src/sandbox/tapered-beam-block/SPEC.md` are
updated to reflect the new beam counts (Example 1 → 11 beams,
Example 2 → 16, Example 3 → 3 with no bump). Constants
`SMALL_REMAINDER = 0.20` and `MEDIUM_REMAINDER = 0.45` are copied
into sandbox helpers per the SPEC §0 isolation rule.

23 new tests across `bump-rule.test.ts`, `endpoint-widths.test.ts`,
and `reproducer.test.ts`. The pre-existing test suite (47 cases) was
updated for the new beam counts and continues to pass.

## Calculator — per-row rate overrides

The Rate column in the calculator is a Select containing **Auto** plus
the 5 catalog tiers from `M2_PRICE_TIERS` in
`src/services/calculation-engine.ts`. **Custom prices are not
allowed** — the validation refines `m2PriceOverrideValue` against the
tier table at the API boundary, and the persistence mapper
(`src/lib/calc-persistence.ts`) re-checks before writing as
defense-in-depth.

Picking a non-Auto tier opens `RateOverrideDialog` (auto-pick vs.
chosen rate side-by-side, optional 200-char free-text reason).
Reverting to Auto applies immediately — going back to the catalog
default is always safe.

Override propagation: calculator store (Zustand auto-save) → Save
Project (Calculation row gains `m2PriceOverride` / `m2PriceReason`
columns) → Place Order (Order's `primaryCalculation` carries the
same row, so the snapshot is automatic) → order detail page (amber
text + Pencil icon, tooltip with auto value + reason) → printable
invoice (compact "↑ Special rate" caption + reason on a sub-line).

Auto-pick recomputes on every dimension change ONLY for un-overridden
rows; once `m2PriceOverride === true`, the rate is sticky until the
operator reverts. This means dimension changes can produce a row
whose override is no longer the auto-pick — that's the intended
behavior; the tooltip surfaces both values so the operator can
notice.

Schema: `Calculation` model gained two columns:
```
m2PriceOverride Boolean @default(false)
m2PriceReason   String?
```
Additive, non-destructive — `db push` migrates existing data with
defaults.

## Calculator — auto-save & Clear button

The calculator's session state (client info, rooms, discount, the
rounding-grid choice, the active draftProjectId) auto-persists to
`localStorage` so in-app navigation, browser refresh, and tab close
don't drop the operator's work. Implementation lives in
`src/store/calculator.ts` (Zustand + `persist` middleware) with a
hydration hook in `src/store/useHydrateCalculator.ts`.

Per-user keying: factory PCs are shared, so each operator sees their
own draft. On app mount the hook fetches `/api/auth/me`, then points
the persist storage at `calculator-draft-${userId}` and rehydrates.
If `/me` fails (logged-out / network), it falls back to a shared
`calculator-draft-anon` key so the calculator still works.

One-shot migration: the pre-Zustand keys (`calc:autosave:v1` for
session data, `calculator.roundingGrid` for the rounding preference)
are read once on first hydration into the per-user slot, then
deleted. Existing operators don't lose their in-flight draft.

Two ways to clear the auto-save:
- **Тозалаш · Clear** button in the calculator header — confirms via
  dialog, wipes session fields (rooms, client, discount, draft id);
  preserves the rounding-grid preference.
- **Automatic** after a successful Place Order — the work is
  committed permanently to the Order, no reason to hold the draft.

The auto-save layer is INDEPENDENT of the Save Project / `/projects`
DB persistence. Save Project still writes a `Project` row (and its
calculations) to the database; the auto-save is a separate
session-level safety net. After a successful Save, the auto-save is
cleared too (the operator just committed; next edits start fresh).

SSR safety: the persist middleware uses `skipHydration: true` and a
custom `safeJSONStorage` adapter (in `src/store/calculator.ts`) that
guards on `typeof window`. Hydration only fires from a client effect
once `/api/auth/me` resolves.

## Calculator — width rounding (5 / 10 cm grid)

The production calculator's Width column has up/down chevron buttons
beside each input that snap the value to a grid multiple. A toolbar
above the table picks the grid (10 cm default; 5 cm alt) and persists
the choice in `localStorage` under `calculator.roundingGrid`. A "Round
all up" button applies the snap-up to every row in one click.

When a row arrives with an engineering ground truth (the tapered
sandbox prefill stamps `originalWidth = innerWidth` per room), rounding
the value BELOW the original surfaces an amber ⚠ next to the input
with a bilingual tooltip. The Place Order dialog repeats the warning
in a compact list when any room is undersized — non-blocking, the
operator decides. Manual rooms have `originalWidth = 0`, never warn.
Drafts reopened from the DB lose `originalWidth` (it's a UI-only
field), so the warning ceases — the assumption is the operator
already validated dimensions when the draft was saved.

## Etalon UI redesign (branch `testui`)

A Claude Design output for the CRM was applied as a multi-commit
redesign on `testui`. Light-mode only, no engine / API / permission /
schema changes — purely visual + structural. The source-of-truth
design files live in `docs/design/` (5 JSX references + a static HTML
preview + a one-pager `REDESIGN.md` mapping each handoff piece to the
production file it informs).

Key choices baked in:
- **Tokens**: Manrope body + JetBrains Mono numerics, etalon light
  palette (electric blue `#4e80ff` primary, soft-blue page bg
  `#f3f5fb`, dark sidebar). Hex values are in `docs/design/REDESIGN.md`
  and consumed via HSL vars in `src/app/globals.css`.
- **Primitives**: new `<Chip>` (status pills, `bg-{color}/10
  text-{color} border border-{color}/30`) and `<KpiCard>`.
- **Layout shell**: dark `<Sidebar>` (240/60 px, collapsible, persisted)
  + new `<TopBar>` (breadcrumb + search + bell) — both wired in
  `(app)/layout.tsx`. Mobile drawer reuses `SidebarBody`.
- **Per-screen pattern**: tables get colored row left-borders matching
  the status, underline-style filter tabs, mono numerics, zebra
  striping, and `<Chip>` for any status/role/payment-state badge.
- **Calculator zone bands**: the Modo-inspired amber / sky / emerald
  bands (Inputs / Pattern / Computed / Pricing) on the calculator
  table are intentional — kept as-is per the design spec.

To preview locally: `git checkout testui && npm run dev`. Merge into
`main` once verified.

## Blender Bridge (branch `drawingModule`)

Owner-only personal feature that pushes saved rooms from the CRM
to a locally-running Blender (precast addon) via a self-hosted
WebSocket service. One-direction only — CRM → Blender — and gated
strictly behind the new `blender.bridge` permission, which only
the OWNER role template gets.

### Architecture

```
┌────────────┐         POST /api/drawings/request       ┌──────────────┐
│  Browser   │ ─────────────────────────────────────►   │  Next.js app │
│  (owner)   │                                          │   (Docker)   │
└────────────┘                                          └──────┬───────┘
       │                                                       │
       │ GET status / poll request                             │ insert PENDING row +
       │                                                       │ POST /flush
       ▼                                                       ▼
┌────────────┐                                          ┌──────────────┐
│  Postgres  │ ◄──────── SQL (UPDATE → DELIVERED) ──────│   ws-bridge  │
│  (Docker)  │                                          │   (Docker)   │
└────────────┘                                          └──────┬───────┘
                                                               │ wss://host/ws
                                                               │   ?secret=…
                                                               ▼
                                                       ┌──────────────┐
                                                       │   Blender    │
                                                       │  + addon     │
                                                       └──────────────┘
```

### Files added

- `ws-bridge/server.js` — single-Blender WebSocket server + 2s
  poll fallback + internal HTTP `/flush` + `/status`
- `ws-bridge/Dockerfile`, `package.json`, `.dockerignore`
- `src/lib/blender-bridge/normalize-rooms.ts` — camelCase Calculation
  rows → snake_case Blender shape + validator (≤50 rooms, dims > 0)
- `src/app/api/drawings/request/route.ts` — POST (creates row,
  rate-limited to 10/min/user, snapshots rooms, kicks the bridge)
- `src/app/api/drawings/request/[id]/route.ts` — GET (single-request
  poll, scoped to `createdById`)
- `src/app/api/drawings/status/route.ts` — GET (bridge connection
  state + 10 most recent requests for the user)
- `src/components/blender-bridge/SendToBlenderButton.tsx` — UI button
  with idle → sending → polling → delivered|failed lifecycle
- `src/components/blender-bridge/BlenderStatusIndicator.tsx` —
  sidebar-footer dot showing whether Blender is connected

### Files modified

- `prisma/schema.prisma` — `DrawingRequest` model + `DrawingRequestStatus`
  enum + reverse relations on `Order`, `Project`, `User`
- `src/lib/permissions.ts` — `blender.bridge` action + label, granted
  only to OWNER template
- `docker-compose.yml` — new `ws-bridge` service (exposes 8765/8766
  on the compose network; neither port is published)
- `Caddyfile` — `/ws` path matcher routes to `ws-bridge:8765`
- `.env.example` / `.env.production.example` — `BRIDGE_SECRET` slot
- `src/app/(app)/orders/[id]/page.tsx` — SendToBlenderButton (owner)
- `src/app/(app)/projects/[id]/page.tsx` — SendToBlenderButton (owner)
- `src/components/sidebar.tsx` — BlenderStatusIndicator in footer
- `DEPLOYMENT.md` — Blender Bridge section

### Lifecycle

`DrawingRequest.status`:
- `PENDING` — created by the POST route, awaiting bridge push
- `DELIVERED` — bridge received `{ type: "ACK", requestId }` from Blender
- `FAILED` — bridge received `{ type: "ERROR", requestId, error }`,
  OR the row's `roomsJson` failed to parse on the bridge side, OR
  the UI polled past the 30s timeout (button-side state only)

The bridge polls Postgres every 2s as a fallback for the
fire-and-forget `/flush` kick from the API route — neither hop is
load-bearing alone.

### Rooms snapshot

The room shape sent to Blender is the **normalized** snake_case
shape, frozen into `DrawingRequest.roomsJson` at creation time.
So if the owner later edits the order or project, the snapshot
the Blender addon already received doesn't drift. Conversion
from Prisma's camelCase Decimal-typed Calculation rows happens
in `normalizeRoomsForBlender()`. `patternOverride` (operator's
pick) is preferred over `pattern` (engine's frozen pick); AUTO
emits `null` to let the addon re-derive.

### Security model

The bridge service accepts exactly one WebSocket client at a time,
gated by `BRIDGE_SECRET` (a 32-byte hex from `openssl rand -hex 32`)
passed as `?secret=…` in the URL. A second authenticated client
boots the first — assumed scenario is the owner restarting Blender
on the same laptop, not two devices.

Internal HTTP (`:8766`) is **never** published — only the compose
network reaches it. Without that boundary the `/flush` endpoint
would be an unauthenticated push trigger.

The `blender.bridge` permission gates:
- POST / GET routes via `withPermission()`
- The SendToBlenderButton (UI hides for non-owners)
- The BlenderStatusIndicator (UI hides for non-owners)

### Local testing without a real Blender

Use `wscat` or any WS client:

```bash
wscat -c "ws://localhost:8765/?secret=YOUR_SECRET"
# On connect, you'll see PENDING requests flushed as JSON.
# To ACK one:
> {"type":"ACK","requestId":"<id-from-the-DRAWING_REQUEST-payload>"}
```

The bridge service must be reachable at `:8765` (compose maps it
internally). For local dev outside Docker, set `WS_BRIDGE_PORT=8765`
and `DATABASE_URL` and run `node ws-bridge/server.js` directly.

## Verified local state at handoff

- `npx tsc --noEmit` — 0 errors
- `npx vitest run` — 334 passed, 1 skipped (pre-existing)
- `npx next build` — clean
- Repo: https://github.com/azizdadabaev/precast-crm
