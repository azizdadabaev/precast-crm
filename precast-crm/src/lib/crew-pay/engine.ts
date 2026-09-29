// Crew pay engine: a line-by-line port of the Donabay workbook's reference
// engine (scripts/crew-pay/reference_engine.py) and its business rules
// (docs/superpowers/specs/2026-09-28-crew-pay-design.md §6). Pure: no DB, no
// clock. Every date is an ISO "YYYY-MM-DD" string; every amount is whole so'm.

export type IsoDate = string;
export type LedgerType = "ADVANCE" | "WEEKLY_PAY" | "CORRECTION";
export type SettingKey = "BREAK_ALLOWANCE" | "DEBT_CAP" | "REJECT_ALARM";

export interface EngineWorker {
  id: string;
  code: string;
  name: string;
  status: "ACTIVE" | "LEFT";
  joinedOn: IsoDate;
  leftOn: IsoDate | null;
}
/**
 * attendance: workerId → days counted (absent = no key). The CRM only writes 1:
 * no half days, pay follows blocks produced. The engine stays numeric for
 * parity with the workbook's reference engine.
 */
export interface EngineDay {
  date: IsoDate;
  moulded: number | null;
  broken: number;
  attendance: Record<string, number>;
}
export interface EngineLedgerEntry {
  id: string;
  seq: number;
  date: IsoDate;
  workerId: string;
  type: LedgerType;
  amount: number;
  /** Set on a CORRECTION made by «Бекор қилиш»: the type of the entry it cancels. */
  reverses?: LedgerType;
}
export interface EngineRate { effectiveFrom: IsoDate; ratePerBlock: number }
export interface EngineSetting { key: SettingKey; value: number; effectiveFrom: IsoDate }
export interface EngineInput {
  workers: EngineWorker[];
  days: EngineDay[];
  ledger: EngineLedgerEntry[];
  rates: EngineRate[];
  settings: EngineSetting[];
}

export const FIRST_WEEK_START: IsoDate = "2026-08-31";
/** The workbook's share check tolerates a few so'm of rounding drift. */
export const SHARE_DRIFT_TOLERANCE = 12;

/** Excel ROUND(v, 0): half away from zero. Math.round(-2.5) is -2, wrong here. */
export function xround(v: number): number {
  const r = Math.floor(Math.abs(v) + 0.5);
  return v < 0 ? -r : r;
}

export function addDays(date: IsoDate, n: number): IsoDate {
  const t = Date.parse(`${date}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Monday of the Monday–Sunday week containing `date`. */
export function weekStartOf(date: IsoDate): IsoDate {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

/** Latest row whose effectiveFrom <= on (ISO strings compare correctly). */
export function valueOn<T extends { effectiveFrom: IsoDate }>(rows: readonly T[], on: IsoDate): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (r.effectiveFrom <= on && (!best || r.effectiveFrom > best.effectiveFrom)) best = r;
  }
  return best;
}

export function settingOn(settings: readonly EngineSetting[], key: SettingKey, on: IsoDate): number | null {
  return valueOn(settings.filter((s) => s.key === key), on)?.value ?? null;
}

export interface DayCalc {
  date: IsoDate;
  weekStart: IsoDate;
  moulded: number;
  broken: number;
  good: number;
  paidBlocks: number;
  /** null when no rate is in force on this date. */
  rate: number | null;
  payValue: number;
  crewDays: number;
}

export function dayCalc(input: EngineInput, day: EngineDay): DayCalc {
  const moulded = day.moulded ?? 0;
  const broken = day.broken ?? 0;
  const allowance = settingOn(input.settings, "BREAK_ALLOWANCE", day.date) ?? 0;
  const paidBlocks = moulded - Math.max(0, broken - allowance * moulded);
  const rateRow = valueOn(input.rates, day.date);
  const rate = rateRow ? rateRow.ratePerBlock : null;
  let crewDays = 0;
  for (const v of Object.values(day.attendance)) if (v) crewDays += v;
  return {
    date: day.date,
    weekStart: weekStartOf(day.date),
    moulded,
    broken,
    good: moulded - broken,
    paidBlocks,
    rate,
    // Not rounded per day: the workbook sums exact pay values and rounds only
    // each worker's share (golden-allow3 proves parity with a 3 % allowance).
    payValue: paidBlocks * (rate ?? 0),
    crewDays,
  };
}

export interface WeekCalc {
  weekStart: IsoDate;
  weekEnd: IsoDate;
  moulded: number;
  broken: number;
  good: number;
  paidBlocks: number;
  /** Σ pay values: the crew's money for the week. */
  pot: number;
  crewDays: number;
  /** workerId → days worked this week (only workers with > 0). */
  days: Record<string, number>;
  /** workerId → share of the pot, each rounded (Excel parity). */
  shares: Record<string, number>;
  rejectRate: number | null;
  goodPerCrewDay: number | null;
  /** Σ shares − pot; the workbook tolerates |drift| <= 12. */
  shareDrift: number;
}

export function computeWeeks(input: EngineInput): Map<IsoDate, WeekCalc> {
  const acc = new Map<IsoDate, WeekCalc>();
  for (const day of input.days) {
    const c = dayCalc(input, day);
    let w = acc.get(c.weekStart);
    if (!w) {
      w = {
        weekStart: c.weekStart, weekEnd: addDays(c.weekStart, 6),
        moulded: 0, broken: 0, good: 0, paidBlocks: 0, pot: 0, crewDays: 0,
        days: {}, shares: {}, rejectRate: null, goodPerCrewDay: null, shareDrift: 0,
      };
      acc.set(c.weekStart, w);
    }
    w.moulded += c.moulded;
    w.broken += c.broken;
    w.good += c.good;
    w.paidBlocks += c.paidBlocks;
    w.pot += c.payValue;
    w.crewDays += c.crewDays;
    for (const [workerId, v] of Object.entries(day.attendance)) {
      if (v) w.days[workerId] = (w.days[workerId] ?? 0) + v;
    }
  }
  for (const w of acc.values()) {
    for (const [workerId, d] of Object.entries(w.days)) {
      w.shares[workerId] = w.crewDays === 0 ? 0 : xround((w.pot * d) / w.crewDays);
    }
    w.rejectRate = w.moulded === 0 ? null : w.broken / w.moulded;
    w.goodPerCrewDay = w.crewDays === 0 ? null : w.good / w.crewDays;
    w.shareDrift = Object.values(w.shares).reduce((s, v) => s + v, 0) - w.pot;
  }
  return new Map([...acc.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export type PayStatus = "OWES_YOU" | "NOT_YET_PAID" | "YOU_OWE" | "SETTLED";

/** One Weekly Pay row (rules §6). Letters = the workbook's columns. */
export interface PayRow {
  workerId: string;
  code: string;
  name: string;
  days: number;
  /** days ÷ crew-days (display only); null when the week has no attendance. */
  sharePct: number | null;
  earned: number;          // F
  broughtForward: number;  // G (+ owner owes worker, − worker owes owner)
  advances: number;        // H
  corrections: number;     // I
  due: number;             // J
  toPay: number;           // K
  paid: number;            // L
  stillToPay: number;      // M
  carriedForward: number;  // N
  status: PayStatus;
}

/**
 * The Weekly Pay column an entry counts in. A cancellation counts in the column
 * of the entry it cancels (a cancelled payment reduces "paid", a cancelled
 * advance reduces "advances"), so cancel-then-pay-again shows the payment once
 * instead of inflating both "paid" and TO PAY. The balance is the same either
 * way; only the columns differ. Workbook corrections carry no link and stay in
 * the corrections column (parity).
 */
export function ledgerColumn(e: EngineLedgerEntry): LedgerType {
  return e.type === "CORRECTION" && e.reverses && e.reverses !== "CORRECTION" ? e.reverses : e.type;
}

const sumLedger = (input: EngineInput, pred: (e: EngineLedgerEntry) => boolean): number =>
  input.ledger.reduce((s, e) => (pred(e) ? s + e.amount : s), 0);

export function weeklyPay(input: EngineInput, weeks: Map<IsoDate, WeekCalc>, weekStart: IsoDate): PayRow[] {
  const weekEnd = addDays(weekStart, 6);
  const wk = weeks.get(weekStart);
  const cap = settingOn(input.settings, "DEBT_CAP", weekStart) ?? 1;
  return input.workers.map((w) => {
    let earnedBefore = 0;
    for (const [s, week] of weeks) if (s < weekStart) earnedBefore += week.shares[w.id] ?? 0;
    const cashBefore = sumLedger(input, (e) => e.workerId === w.id && e.date < weekStart);
    const inWeek = (t: LedgerType) =>
      sumLedger(input, (e) => e.workerId === w.id && ledgerColumn(e) === t && e.date >= weekStart && e.date <= weekEnd);
    const G = earnedBefore - cashBefore;
    const days = wk?.days[w.id] ?? 0;
    const F = wk?.shares[w.id] ?? 0;
    const H = inWeek("ADVANCE");
    const I = inWeek("CORRECTION");
    const L = inWeek("WEEKLY_PAY");
    const J = G + F - H - I;
    // Old debt beyond cap × earnings carries forward; same-week advances are
    // prepayments and are always taken in full (rules §6).
    const K = G >= 0 ? xround(Math.max(0, J)) : xround(Math.max(0, F - H - I - Math.min(-G, cap * F)));
    const M = Math.max(0, K - L);
    const N = J - L;
    const n = xround(N);
    const status: PayStatus = n < 0 ? "OWES_YOU" : n > 0 && M > 0 ? "NOT_YET_PAID" : n > 0 ? "YOU_OWE" : "SETTLED";
    return {
      workerId: w.id, code: w.code, name: w.name, days,
      sharePct: wk && wk.crewDays > 0 ? days / wk.crewDays : null,
      earned: F, broughtForward: G, advances: H, corrections: I, due: J,
      toPay: K, paid: L, stillToPay: M, carriedForward: N, status,
    };
  });
}

/**
 * Worker balance on `date` (rules §7/§8): shares of every week up to and
 * including the week of `date`, minus every ledger amount dated <= `date`.
 * Positive = owner owes the worker. Used for ledger "balance after" and "owed now".
 */
export function balanceAt(input: EngineInput, weeks: Map<IsoDate, WeekCalc>, workerId: string, date: IsoDate): number {
  const ws = weekStartOf(date);
  let earned = 0;
  for (const [s, week] of weeks) if (s <= ws) earned += week.shares[workerId] ?? 0;
  return earned - sumLedger(input, (e) => e.workerId === workerId && e.date <= date);
}
