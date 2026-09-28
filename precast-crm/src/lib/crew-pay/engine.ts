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
/** attendance: workerId → 1 (full day) or 0.5 (half day); absent = no key. */
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
    payValue: xround(paidBlocks * (rate ?? 0)),
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
