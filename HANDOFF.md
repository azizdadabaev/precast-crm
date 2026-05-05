# Handoff — Precast CRM (Calculation Engine Rework)

> Drop this file path into your next Claude Code session as the first message
> ("read HANDOFF.md and continue") and it will pick up exactly where we left off.

## Where we are

The project skeleton is complete and **runs end-to-end** on the original machine.
Build, type-check, and unit tests are all green. The blocker is **business logic**,
not engineering: the calculation engine does math that doesn't match the company's
real-world layout rules. The user wants to throw it away and rebuild it correctly.

## What was already fixed in the last session

- Rewrote `src/services/calculation-engine.ts` to a remainder-based rule (passes 18/18 tests, but the **rule itself is the thing the user is challenging**).
- Fixed 6 TypeScript errors (Prisma JSON casts in `seed.ts`, `api/calculate/route.ts`, `api/projects/route.ts`; missing `coveredArea` field on the project page interface).
- Wrapped `useSearchParams()` in `<Suspense>` on `src/app/login/page.tsx` so the production build succeeds.
- Added `export const dynamic = "force-dynamic"` to all 14 API routes so `next build` doesn't try to prerender DB-touching endpoints.
- Deleted loose root-level duplicate files (`calculation-engine.ts`, `calculation-engine.test.ts`, `schema.prisma`) and stray brace-expansion empty directories.
- Synced the inner and outer README to document the new algorithm.

Verified working: `npx tsc --noEmit` (0 errors), `npx vitest run` (18/18), `npx next build` (clean), `npm run db:push` + `npm run db:seed` (Postgres on `localhost:5432`, password `admin`, db `precast_crm`).

## The actual open question — calculation logic

The user said: **"the calculation logic is simply dumb. I want logical and consistent calculation logic. ask anything that is needed to correctly calculate any given area."**

The user is on a different machine now and will answer the questions below in the next session. **Do not attempt to rewrite the engine until they answer.** Their answers determine everything.

### Questions waiting for the user

#### 1. Physical layout — pick A, B, or C
- **A** — beams sit on the two opposite walls, blocks fill between beams → N beams, N−1 block rows
- **B** — blocks sit on the wall, beams between → N beams, N+1 block rows
- **C** — alternating, walls on block ends → N beams, N block rows

#### 2. Room "length"
What does L represent — inside-wall to inside-wall (clear), outside-to-outside, or something else?

#### 3. Remainder rule
For length L = 6 m: 6 ÷ 0.58 = 10.34. 10 full pitches use 5.80 m, leaving 20 cm.
On site, what does the foreman actually do?
- add an 11th beam (over-cover)?
- leave 10 beams + a custom-cut 20 cm filler block strip?
- widen the last gap?
- round the room dimension at the sales stage?

And: at what remainder threshold does the rule change? (current code uses 20 cm — is that right?)

#### 4. Block dimensions (mm)
- length along the beam direction: ___ (was variously 195 / 200 in the codebase)
- width perpendicular to beam: ___ (the dimension that fills between beams)
- height: ___
- Are blocks ever cut to fit, or always whole?

#### 5. The 35 mm `EDGE_OFFSET`
Old code subtracts 35 mm from the covered length. What is it physically? Real, or remove it?

#### 6. The 200 mm `BLOCK_EDGE_LOSS`
Old code does `(beam_length − 200 mm) ÷ block_length`. What does the 200 mm represent?

#### 7. Pricing model
- per m² of floor — and "area" means raw `W × L`, covered length × W, block-row area, or other?
- per linear meter of beam at price tiers?
- per block?
- delivery flat fee?

#### 8. Original Excel / source
If the user can share the spreadsheet, screenshot of formulas, or even a paper-notebook page — match those formulas one-to-one instead of guessing.

## File map (where things live)

- Engine (the thing being rewritten): [`src/services/calculation-engine.ts`](precast-crm/src/services/calculation-engine.ts)
- Engine tests (will need updating once the rule is settled): [`tests/calculation-engine.test.ts`](precast-crm/tests/calculation-engine.test.ts)
- Persistence (writes engine outputs to DB): [`src/app/api/calculate/route.ts`](precast-crm/src/app/api/calculate/route.ts), [`src/app/api/projects/route.ts`](precast-crm/src/app/api/projects/route.ts)
- DB schema (`Calculation` model — note: stores `coveredArea` but engine returns `m2_area` etc., not yet persisted): [`prisma/schema.prisma`](precast-crm/prisma/schema.prisma)
- Multi-room calculator UI (consumes `extra_beams_qty`, `m2_area`, `weights.total_kg` etc. — these are derived in the engine, not in the DB): [`src/components/calculation/MultiRoomCalculator.tsx`](precast-crm/src/components/calculation/MultiRoomCalculator.tsx)
- Project detail page (was missing `coveredArea` in its TS interface — fixed): [`src/app/(app)/projects/[id]/page.tsx`](precast-crm/src/app/\(app\)/projects/[id]/page.tsx)

## Local setup on the new machine

```powershell
# 1. Clone
cd C:\path\to\wherever
git clone https://github.com/azizdadabaev/precast-crm.git
cd precast-crm\precast-crm

# 2. Install
npm install

# 3. Recreate .env (it's gitignored — copy from .env.example and edit DATABASE_URL)
copy .env.example .env
# Then open .env and set DATABASE_URL to your local Postgres connection string,
# e.g. postgresql://postgres:YOUR_PASSWORD@localhost:5432/precast_crm?schema=public
# JWT_SECRET can stay as the placeholder for local dev.

# 4. Postgres setup (if not already running on the new machine)
# Install Postgres, then:
$env:PGPASSWORD = "YOUR_PASSWORD"
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -h localhost -d postgres -c "CREATE DATABASE precast_crm"

# 5. Apply schema + seed
npm run db:push
npm run db:seed         # admin@precast.local / admin123

# 6. Start dev
npm run dev             # http://localhost:3000
```

## Continuing the Claude Code session on the new machine

Claude Code conversation history is **stored locally per machine** (under `~/.claude/projects/...`), so it does not transfer through git. The practical handoff is this file plus the user's own answers to the 8 questions above.

In the new Claude Code session, open the cloned repo and start with:
> Read `HANDOFF.md`. I'm continuing from a different machine. Here are my answers to the open questions: …

Claude will then have all the context it needs.

## Things that do NOT carry over

- **`.env`** — gitignored. Recreate from `.env.example`.
- **Postgres data** — lives only in the local Postgres on the original machine. On the new machine, `db:push` + `db:seed` recreate the schema and demo data fresh. (If you need the exact same data, run `pg_dump` on the original and `pg_restore` on the new — but for development, fresh seed is simpler.)
- **Running dev server** — the `npm run dev` process on the original machine stops when that Claude session ends. Just start it again on the new machine.
- **Conversation thread** — Claude Code sessions are local to the machine. This file is the substitute.
