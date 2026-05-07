# Handoff — Precast CRM

> Drop this file path into your next Claude Code session ("read HANDOFF.md")
> and it will pick up exactly where we left off.

## What this is

Beam-and-block flooring CRM for an Uzbek precast manufacturer. Operator-driven
workflow:

```
Calculator → Save Project (draft) → Place Order → In Production → Delivered → Paid
                                       ↑ creates Client + Order atomically
```

Sidebar (UZ-primary):
**Бошқарув · Калькулятор · Лойиҳалар · Буюртмалар · Мижозлар**
(Pipeline + Quotes are hidden from nav; Deal model still backs the data.)

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
10. **Print** any order at `/orders/[id]/print` — auto-triggers `window.print()`. The delivery proof prints on its own page.

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

## Verified local state at handoff

- `npx tsc --noEmit` — 0 errors
- `npx vitest run` — 60 / 60
- `npx next build` — clean
- Most recent commit: **`89281ee`** "Gate IN_PRODUCTION → DELIVERED behind a mandatory delivery photo"
- Repo: https://github.com/azizdadabaev/precast-crm
