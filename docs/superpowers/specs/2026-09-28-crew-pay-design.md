# Crew pay (Бригада маоши): 10 cm filler-block crew, design spec

Status: design approved in chat on 2026-09-28; this written spec is awaiting the owner's review.
Source material: `files/Donabay.xlsx`. Its "Spec 00–07" tabs are a complete build pack (PRD, business rules, schema, SQL, plan, seed, reference engine). This spec **adopts that pack** and records how it is adapted to live inside the CRM. When the two disagree, this spec wins. On pay maths it defers to the pack's `02_BUSINESS_RULES`, which is normative.

## 1. Goal

The owner pays the **10 cm filler-block crew per good block**, and today does it in Excel. The goal is **one place for everything**: this crew's pay lives inside the CRM as its own tab. The owner opens it any day, types what happened, and **the money is calculated**: earnings, advances, debt, and what to pay on payday.

Success criteria:
1. Importing the workbook data reproduces the pack's golden numbers **to the so'm**: every week, every share, every Weekly Pay field for every worker and week, and all 20 ledger balance-after values.
2. The owner can log a production day in under a minute (for 4 workers present: tap «Ҳамма келди», type two numbers).
3. Payday takes under 5 minutes. The owner sees TO PAY per worker, presses Pay (or Pay all), closes the week and prints payslips. The Excel copy-paste step disappears.
4. A paid, closed week can never change silently. Ledger rows can never be deleted or have their amounts changed.

## 2. Scope

**In:** workers, daily log with attendance, cash ledger, weekly pay with Pay / Close / Reopen, printable payslip, worker history, effective-dated rates and settings, checks and warnings, one-time import, golden tests.

**Out (this version):**
- CRM block-stock link. There are two filler-block types: 10 cm (piece-rate crew, this feature) and 15 cm (monthly-paid crew). CRM stock has a single BLOCK kind, so linking would corrupt it.
- Other roles (supervisor / viewer / worker).
- Android app and offline sync.
- PDF generation and Telegram/WhatsApp sharing.
- Charts, CSV/XLSX export.
- КТУ coefficient and a broken-block cause field.
- A Uzbek Latin payslip.
- Multi-plant support.

## 3. Decisions on the pack's open questions (owner delegated them 2026-09-28)

| # | Question | Decision | Reason |
|---|---|---|---|
| 1 | Real joining dates of W01–W04 | All `2026-08-31`, editable per worker | Only gates the "attendance before joining" check; they worked from 4 Sep |
| 2 | Fixed payday (Saturday)? | No fixed day. Pay is tied to the selected week. The Pay button dates entries `clamp(today, weekStart, weekEnd)` | This is how specialist tools do it. Labour Code Art. 253 only requires pay at least every half-month |
| 3 | Rounding | Excel parity: each share `round half away from zero`, drift ≤ 12 so'm shown in checks | History must match what was already paid |
| 4 | Debt cap | Effective-dated: **100 % from 2026-08-31, 50 % from 2026-09-28** | Art. 270 caps deductions at 50 % per payment. The cap applies only to *old debt* (same-week advances are prepayments). Past weeks keep parity |
| 5 | Languages | Uzbek Cyrillic across the whole tab, including payslips | CRM rule |

Legal warnings added, all warnings and never blocking:
- **Unpaid week:** a finished week still unpaid 14 days after it ends (Art. 253).
- **Old debt:** a worker's debt older than 30 days (Art. 269, one-month recovery window).
- **Rate cut:** a new rate lower than the current one (Art. 247, 2-month written notice).

## 4. Screens

New sidebar item **«Бригада маоши»** (latin hint "Crew pay"), placed in `OPERATIONS_NAV` right after «Ишлаб чиқариш». Route `/crew-pay`, with inner tabs as sub-routes. All UI text is Uzbek Cyrillic. Numbers are mono with tabular figures and a space thousands separator (`5 928 500`), with the unit `сўм`. The screens reuse the CRM's existing card, table, badge and button components and tokens (none of the pack's indigo design).

| Route | Tab | Content |
|---|---|---|
| `/crew-pay` | **Умумий** | Week picker (default = current week, Asia/Tashkent). KPI cards: good blocks (of N moulded), crew earned (pot), crew-days (with good blocks per crew-day), reject rate (alarm colour above the setting), advances this week (count + sum), owed to crew now. Checks banner ("Ҳаммаси жойида" or "N та муаммо", expandable list linking to rows). Crew table: worker · days · earned this week · advances this week · owed now · status |
| `/crew-pay/days` | **Кунлик журнал** | One week at a time (prev/next). Rows = Mon–Sun. Inputs: moulded, broken, notes. A chip per active worker cycles `1 → 0.5 → absent`, plus a «Ҳамма келди» button per row. Computed: good, paid blocks, crew-days, rate, pay value; week subtotal row. Today's row is highlighted. Row errors and warnings appear inline (pack rules §9). A closed week is read-only with a lock badge |
| `/crew-pay/ledger` | **Касса** | «Аванс бериш» form: date (default today), worker, amount, reason, method (нақд / карта / ҳисобга олиш / бошқа). The list shows #, date, worker, type, amount, method, reason, signed, balance after, and has filters (worker, type, week). Actions per row: «Қайтариш» (reverse → prefilled Correction, owner can adjust) and edit reason / signed / method only. An advance that pushes the balance below 0 shows a confirm dialog (warning, not error). Totals by type |
| `/crew-pay/pay` | **Иш ҳақи** | Week picker (default = latest week with production that is not closed). Per-worker table: days · share % · earned · brought forward · advances · corrections · due · **TO PAY** · paid · still to pay · carried forward · status. Crew totals row. «Тўлаш» per worker and «Ҳаммасига тўлаш» open a confirm dialog with editable amounts (default = still to pay) and method. «Ҳафтани ёпиш» is disabled while any check has an error. «Қайта очиш» requires a reason |
| `/crew-pay/workers` | **Ишчилар** | List with code, name, status, joined, left, phone, notes. Add; edit; mark as left (sets left date). No delete. Clicking a worker opens the history: one row per week (days, earned, advances, corrections, paid, end balance) plus their ledger entries |
| `/crew-pay/settings` | **Созламалар** | Rate table (from date → so'm per block), add row only. Effective-dated settings: breakage allowance %, debt cap %, reject alarm %. Help text, including the legal notes |
| `/crew-pay/payslip/[week]/[workerId]` | Payslip | Print-friendly page: company, worker, week range, days, earned, brought forward, each advance (date, amount, reason), corrections, due, TO PAY, paid, carried forward, status, signature lines for worker and owner. Opened from the Иш ҳақи row |

Empty states: no workers → prompt to add one; no rate → the checks banner and daily log explain that a rate is needed first.

## 5. Data model (Prisma, additive only)

Money is `Int`, in whole so'm (fits 2.1 bn per value; sums are computed in JS `number`, exact below 2⁵³). Business dates are `@db.Date`.

```prisma
enum CrewWorkerStatus { ACTIVE LEFT }
enum CrewLedgerType   { ADVANCE WEEKLY_PAY CORRECTION }
enum CrewLedgerMethod { CASH CARD OFFSET OTHER }
enum CrewSettingKey   { BREAK_ALLOWANCE DEBT_CAP REJECT_ALARM }
enum CrewWeekState    { OPEN CLOSED }

model CrewWorker {
  id        String   @id @default(cuid())
  code      String   @unique            // W01… never reused
  name      String   @unique
  status    CrewWorkerStatus @default(ACTIVE)
  joinedOn  DateTime @db.Date
  leftOn    DateTime? @db.Date
  phone     String?
  notes     String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  attendance CrewAttendance[]
  ledger     CrewLedgerEntry[]
}

model CrewDay {
  id          String   @id @default(cuid())
  workDate    DateTime @unique @db.Date
  moulded     Int?                        // null = not entered yet
  broken      Int      @default(0)
  notes       String?
  updatedById String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  attendance  CrewAttendance[]
}

model CrewAttendance {
  dayId     String
  workerId  String
  halfDays  Int                            // 1 = half day, 2 = full day; absent = no row
  day       CrewDay    @relation(fields: [dayId], references: [id], onDelete: Cascade)
  worker    CrewWorker @relation(fields: [workerId], references: [id])
  @@id([dayId, workerId])
}

model CrewLedgerEntry {
  id              String   @id @default(cuid())
  seq             Int      @unique @default(autoincrement())
  entryDate       DateTime @db.Date
  workerId        String
  type            CrewLedgerType
  amount          Int                      // > 0 unless CORRECTION (≠ 0)
  method          CrewLedgerMethod @default(CASH)
  reason          String?
  signed          Boolean  @default(false)
  reversesEntryId String?
  payWeekStart    DateTime? @db.Date       // informational only
  clientKey       String?  @unique         // double-submit guard
  givenByName     String?                  // imported rows
  createdById     String?
  createdAt       DateTime @default(now())
  worker          CrewWorker @relation(fields: [workerId], references: [id])
  @@index([workerId, entryDate])
}

model CrewRate {
  id            String   @id @default(cuid())
  effectiveFrom DateTime @unique @db.Date
  ratePerBlock  Int
  createdById   String?
  createdAt     DateTime @default(now())
}

model CrewSetting {
  id            String   @id @default(cuid())
  key           CrewSettingKey
  value         Decimal  @db.Decimal(5, 4)   // 0.08 = 8 %
  effectiveFrom DateTime @db.Date
  createdById   String?
  createdAt     DateTime @default(now())
  @@unique([key, effectiveFrom])
}

model CrewPayWeek {
  weekStart  DateTime @id @db.Date
  state      CrewWeekState @default(OPEN)
  closedAt   DateTime?
  closedById String?
  snapshot   Json?                           // Weekly Pay table frozen at close
  events     CrewPayWeekEvent[]
}

model CrewPayWeekEvent {
  id        String   @id @default(cuid())
  weekStart DateTime @db.Date
  action    String                           // "close" | "reopen"
  reason    String?
  byId      String?
  at        DateTime @default(now())
  week      CrewPayWeek @relation(fields: [weekStart], references: [weekStart])
}
```

Only raw inputs are stored. Every computed figure (good, pot, shares, TO PAY, balances, checks) comes from the engine at read time, except `CrewPayWeek.snapshot`.

**Date rule (the server runs with `TZ=Asia/Tashkent`):** the engine works only on `YYYY-MM-DD` strings. At the DB boundary a date is `new Date("YYYY-MM-DD")` (UTC midnight) and read back with `toISOString().slice(0, 10)`. Never use `new Date(y, m, d)` for a business date: local midnight is the previous day at 19:00Z and would be stored one day early. "Today" comes from a single helper that formats the current instant in Asia/Tashkent.

## 6. Pay engine: `src/lib/crew-pay/engine.ts` (pure)

A line-by-line port of the pack's `reference_engine.py` and `02_BUSINESS_RULES` §1–§8.

Functions:
- `xround` — half away from zero; `-0.5 → -1`.
- `weekStartOf`
- `valueOn` — effective-dated lookup.
- `dayCalc`
- `computeWeeks` — pot, crew-days, days per worker, shares, reject rate, drift, flags.
- `weeklyPay(weekStart)` — columns F…N plus status, per rules §6, with debt cap taken at the week start.
- `balanceAfter(entry)` — rules §7.
- `owedNow(today)` — rules §8.
- `runChecks` — rules §9, plus the three legal warnings in §3.

Inputs are plain arrays: workers, days with attendance (halfDays / 2), ledger, rates, settings. The server loads everything and computes per request (the data is small: about 300 days and a few hundred ledger rows a year). No caching in this version.

## 7. Server rules: API under `src/app/api/crew-pay/…`, service in `src/lib/crew-pay/service.ts`

- **Access.** A new permission action `crewpay.manage`, added to `ACTIONS`, `PERMISSION_GROUPS`, `ACTION_LABELS` and the `OWNER` role template only. `ROUTE_PERMISSIONS["/crew-pay"] = "crewpay.manage"`. Every route uses `withPermission("crewpay.manage")`.
- **Validation.** Input is validated with Zod at the boundary, following pack rules §9:
  - broken ≤ moulded;
  - attendance ∈ {0.5, 1};
  - a worker must be active on the date;
  - a rate must exist for a day with blocks;
  - no date before `2026-08-31`;
  - ledger amount > 0 unless the entry is a Correction;
  - rate dates must be unique;
  - settings values must be within their ranges.
- **Closed week guard.** Every write that touches a day, attendance or ledger row runs inside a transaction that first checks the week of each affected date. A closed week gets **409** with the Uzbek message «Бу ҳафта ёпилган — аввал қайта очинг». Corrections must be dated in an open week.
- **Ledger is append-only.** There is no DELETE route. PATCH may change only `reason`, `signed` and `method`, and each change is audited. «Қайтариш» creates a CORRECTION with the opposite amount and `reversesEntryId`.
- **Pay.** `POST /pay-weeks/{week}/pay` with `[{workerId, amount, method, clientKey}]` creates WEEKLY_PAY entries dated `clamp(today, S, E)` with `payWeekStart = S`. The unique `clientKey` makes a double submit a no-op.
- **Close.** Allowed only when `runChecks` reports no errors for that week and the weeks before it. It stores the `weeklyPay` result as the snapshot, sets `CLOSED`, and writes an event.
- **Reopen.** Requires a non-empty reason. It sets `OPEN` and writes an event. The snapshot is kept for comparison.
- **Audit.** Every mutation calls `recordAudit()` (`src/lib/audit.ts`) after the write: fire-and-forget, the existing pattern.
- **Errors.** 400 validation (field + Uzbek message), 403 permission, 409 closed week, 422 business rule. The UI shows each error in Uzbek, and the server logs the technical detail.

## 8. Import and go-live

1. `scripts/crew-pay/extract-donabay.py` reads the latest `Donabay.xlsx` (Workers, Daily Log, Cash Ledger, Settings) into `seed_data.json`, in the pack's format. It is run right before go-live, so days entered in Excel meanwhile are included.
2. `scripts/crew-pay/import-seed.ts` refuses to run if any crew table already has rows. It inserts settings (plus DEBT_CAP 0.5 from 2026-09-28), rates, workers (keeping codes), days with attendance, then ledger entries in `seq` order (seq 20 has method OFFSET).
3. After import, the script runs the engine and compares it with a golden file generated by the pack's reference engine on the same seed. Any difference aborts the import (the transaction is rolled back).
4. Deploy is additive: a schema push, no data migration of existing tables, no backup strictly needed. A DB dump is still taken first, as usual.
5. After import the owner closes the already-paid past weeks.

## 9. Testing

- **Golden test** (`tests/crew-pay-golden.test.ts`). The fixtures are the pack's `seed_data.json`, plus the `golden_tests.json` produced by running the pack's `reference_engine.py`, and a second golden file produced by the same engine with the DEBT_CAP 0.5 row added. The TS engine must equal both, every field.
- **Unit tests:**
  - `xround` on negatives and halves;
  - a half day (engine only, workbook parity; the CRM rejects 0,5 since 2026-09-29: the crew is paid for blocks produced, so whoever came counts a full day);
  - a worker with 0 days in a week;
  - a mid-week rate change;
  - breakage allowance 3 %;
  - debt cap 50 % with a negative brought-forward;
  - correction entries;
  - a pot with no attendance;
  - payment dating via clamp;
  - each check and warning.
- **Service tests:**
  - closed-week writes are rejected;
  - the ledger cannot be deleted and its amount cannot be changed;
  - reopen needs a reason;
  - a duplicate `clientKey` is a no-op;
  - close is blocked while there are errors.
- **Pack acceptance criteria** (PRD §8), minus the supervisor one. Week of 2026-09-21: pot 4 452 500, 20 crew-days, share 1 113 125 each; Davlatbek settled; Xusanboy owes 1 686 875; Oybek and Nomonjon owe 99 000.
- **UI check** with realistic data in light and dark themes: empty states, a closed week, long names, large numbers.

## 10. Risks

| Risk | Mitigation |
|---|---|
| JS rounding differs from Excel | One `xround` helper plus the golden tests |
| Timezone off-by-one on dates | String dates in the engine and one boundary rule (§5) |
| Editing history changes paid weeks | Close/lock, snapshots, effective-dated settings |
| Payment dated in the wrong week | The clamp, plus a warning on manual ledger WEEKLY_PAY dated outside the chosen week |
| Workbook keeps changing until go-live | Re-extract right before import; the golden comparison gates the import |
