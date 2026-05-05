# Precast CRM — Beam-and-Block System

Production-ready web application for a precast concrete manufacturing company.
Centered around the workflow:

> **Client → Project → Calculation → Quote → Deal → Payment**

The engineering calculation engine is the heart of the system: a pure, isolated
TypeScript module that replicates the company's Excel formulas exactly.

## Tech Stack

- **Frontend:** Next.js 14 (App Router) · TypeScript · TailwindCSS · ShadCN UI
- **State:** TanStack Query · Zustand
- **Backend:** Next.js API routes · Zod validation
- **Database:** PostgreSQL · Prisma ORM
- **Auth:** JWT (jose) · bcrypt · HTTP-only cookies · edge middleware
- **Tests:** Vitest

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure env
cp .env.example .env
# edit DATABASE_URL and JWT_SECRET

# 3. Database
npm run db:push         # apply schema
npm run db:seed         # admin@precast.local / admin123

# 4. Run
npm run dev             # http://localhost:3000
```

### Tests

```bash
npm test                # run engine unit tests
npm run test:watch
```

## Architecture

```
src/
├── app/
│   ├── (app)/                  ← protected pages (sidebar shell)
│   │   ├── dashboard/
│   │   ├── clients/[id]/
│   │   ├── pipeline/           ← kanban board with drag-and-drop
│   │   ├── projects/new/       ← live calculation panel
│   │   ├── projects/[id]/
│   │   └── quotes/[id|new]/
│   ├── api/                    ← REST endpoints (handler-wrapped)
│   │   ├── auth/{login,register,logout,me}/
│   │   ├── clients/[id]/
│   │   ├── deals/[id]/
│   │   ├── projects/
│   │   ├── calculate/          ← calls the engine
│   │   ├── quotes/[id]/
│   │   ├── payments/
│   │   └── dashboard/
│   ├── login/                  ← public
│   └── layout.tsx
├── components/
│   ├── ui/                     ← shadcn primitives
│   ├── providers.tsx           ← React Query
│   └── sidebar.tsx
├── lib/
│   ├── prisma.ts               ← singleton client
│   ├── auth.ts                 ← JWT + cookies + bcrypt
│   ├── validation.ts           ← Zod schemas (single source of truth)
│   ├── api.ts                  ← handler() wrapper, ok/fail/created
│   ├── fetcher.ts              ← typed client-side fetch
│   └── utils.ts                ← cn, formatMoney, formatDate
├── services/
│   └── calculation-engine.ts   ← THE CORE — pure, no I/O
├── store/
│   └── ui.ts                   ← Zustand UI state
└── middleware.ts               ← edge route protection

prisma/
├── schema.prisma
└── seed.ts                     ← admin user + demo data

tests/
└── calculation-engine.test.ts  ← reference cases verified against Excel
```

## Calculation Engine

The engine lives in `src/services/calculation-engine.ts` and is the **only**
place where slab math runs. It accepts plain inputs, returns plain results, and
takes optional constant overrides.

### Constants

| Constant            | Default | Notes                         |
| ------------------- | ------- | ----------------------------- |
| `BEAM_SPACING`      | 0.58 m  | **Fixed** by company standard |
| `BEARING`           | 0.15 m  | Per-end beam bearing on wall  |
| `EDGE_OFFSET`       | 0.035 m | Edge offset                   |
| `BLOCK_LENGTH`      | 0.195 m | Block length                  |
| `BLOCK_EDGE_LOSS`   | 0.2 m   | Removed before block fit      |
| `TOLERANCE`         | 0.05 m  | Row-correction threshold      |
| `TOPPING_THICKNESS` | 0.05 m  | Concrete topping              |

### Algorithm (matches Excel exactly)

```
beam_length      = width + 2 * BEARING
raw_rows         = length / BEAM_SPACING
rows             = ROUND(raw_rows)            ← Excel half-away-from-zero
actual_length    = rows * BEAM_SPACING - EDGE_OFFSET
delta            = actual_length - length
final_rows       = (delta > TOLERANCE) ? rows - 1 : rows
corrected_length = actual_length - TOLERANCE * (rows - final_rows)
blocks_per_row   = CEIL((beam_length - BLOCK_EDGE_LOSS) / BLOCK_LENGTH)
total_blocks     = blocks_per_row * final_rows
concrete_volume  = width * corrected_length * TOPPING_THICKNESS
```

### Verified reference cases

| Width × Length | Beams | Beam Length | Blocks/row | Total blocks | Correction? |
| -------------- | ----- | ----------- | ---------- | ------------ | ----------- |
| 4 × 6          | 10    | 4.30 m      | 22         | 220          | no          |
| 3 × 5          | 8     | 3.30 m      | 16         | 128          | yes (−1)    |
| 6 × 8          | 13    | 6.30 m      | 32         | 416          | yes (−1)    |
| 2.5 × 3        | 5     | 2.80 m      | 14         | 70           | no          |

### Multi-span (trapezoidal / irregular)

`calculateMultiSpan` applies the spec's grouping rules to slabs with varying width:

| Width span (max − min) | Groups |
| ---------------------- | ------ |
| ≤ 0.25 m               | 1      |
| 0.25 – 0.50 m          | 2      |
| 0.50 – 0.80 m          | 3      |
| > 0.80 m               | 4      |

## API Reference

| Method      | Path               | Purpose                              |
| ----------- | ------------------ | ------------------------------------ |
| POST        | `/api/auth/login`  | Login → sets HTTP-only cookie        |
| POST        | `/api/auth/logout` | Clears cookie                        |
| GET         | `/api/auth/me`     | Current user                         |
| GET / POST  | `/api/clients`     | List + filter / Create               |
| GET / PATCH | `/api/clients/:id` | Detail with deals / Update           |
| GET / POST  | `/api/deals`       | List + filter by stage/status        |
| GET / PATCH | `/api/deals/:id`   | Detail with projects / Update stage  |
| GET / POST  | `/api/projects`    | List / Create + auto-advance deal    |
| **POST**    | `/api/calculate`   | **Calls engine, optionally persists**|
| GET / POST  | `/api/quotes`      | List / Create + auto-set deal stage  |
| GET         | `/api/quotes/:id`  | Full quote with calc + client        |
| GET / POST  | `/api/payments`    | List / Create payment                |
| GET         | `/api/dashboard`   | KPIs, deals-by-stage, recent deals   |

All endpoints return `{ ok: true, data }` or `{ ok: false, error, details }`.

## Business Rules (Enforced)

- Beam spacing is **always 580 mm** — there's no UI control to change it.
- Beam lengths are **grouped** (no per-row customization).
- Calculations are **persisted as snapshots** — every result stores the
  constants it was computed with, so historical quotes remain reproducible.
- Tolerance correction is automatic; the UI flags it with a yellow badge so
  the engineer always sees when a row was removed.

## Roles

| Role     | Default capabilities                                     |
| -------- | -------------------------------------------------------- |
| ADMIN    | Everything, including future config tuning               |
| SALES    | CRM, deals, payments                                     |
| ENGINEER | Projects, calculations, quotes                           |

The middleware protects all `/app` routes; role-level gating can be added
endpoint-by-endpoint via `hasRole(user, ...)` from `lib/auth.ts`.

## Future Extensibility (Schema Already Supports)

- **WhatsApp** integration — `Client.phone` + `language` are first-class.
- **Multi-language UI (UZ/RU)** — `Client.language`, all strings ready for i18n.
- **AI-assisted quoting** — `Calculation.beamGroups` is structured JSON ready
  for an LLM to consume when drafting natural-language quote bodies.
- **Tunable engine constants** — `AppConfig` table is in place; the engine
  already accepts overrides as a function argument.
