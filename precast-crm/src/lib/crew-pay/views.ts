// Pure builders: engine output → the JSON each crew-pay screen renders.
// Routes stay thin; these are unit-tested without a database.
import {
  addDays, balanceAt, computeWeeks, dayCalc, settingOn, weekStartOf, weeklyPay,
  type EngineInput, type EngineLedgerEntry, type IsoDate, type LedgerType, type PayRow, type WeekCalc,
} from "./engine";
import { runChecks, closeBlockers, type CrewIssue } from "./checks";
import { activeOn, isLocked } from "./rules";
import { WEEKDAY_UZ } from "./format";

export type LedgerMethod = "CASH" | "CARD" | "OFFSET" | "OTHER";
export interface LedgerMeta { method: LedgerMethod; reason: string | null; signed: boolean; reversesEntryId: string | null }

export interface CrewState {
  input: EngineInput;
  weeks: Map<IsoDate, WeekCalc>;
  closedWeeks: Set<IsoDate>;
  snapshots: Map<IsoDate, unknown>;
  ledgerMeta: Map<string, LedgerMeta>;
  workerMeta: Map<string, { phone: string | null; notes: string | null }>;
  dayNotes: Map<IsoDate, string | null>;
}

export function buildState(p: {
  input: EngineInput;
  closedWeekStarts: IsoDate[];
  snapshots: Map<IsoDate, unknown>;
  ledgerMeta: Map<string, LedgerMeta>;
  workerMeta: Map<string, { phone: string | null; notes: string | null }>;
  dayNotes: Map<IsoDate, string | null>;
}): CrewState {
  return {
    input: p.input, snapshots: p.snapshots, ledgerMeta: p.ledgerMeta, workerMeta: p.workerMeta, dayNotes: p.dayNotes,
    weeks: computeWeeks(p.input), closedWeeks: new Set(p.closedWeekStarts),
  };
}

const inWeek = (d: IsoDate, ws: IsoDate) => d >= ws && d <= addDays(ws, 6);
const workerName = (s: CrewState, id: string) => s.input.workers.find((w) => w.id === id)?.name ?? "?";

// ---------- Umumiy ----------
export interface OverviewView {
  weekStart: IsoDate;
  weekEnd: IsoDate;
  closed: boolean;
  kpis: {
    moulded: number; good: number; pot: number; crewDays: number; goodPerCrewDay: number | null;
    rejectRate: number | null; rejectAlarm: number | null; advancesCount: number; advancesSum: number; owedToCrew: number;
  };
  crew: Array<{ workerId: string; name: string; days: number; earned: number; advances: number; owedNow: number; status: PayRow["status"] }>;
  issues: CrewIssue[];
}

export function overviewView(s: CrewState, weekStart: IsoDate, today: IsoDate): OverviewView {
  const w = s.weeks.get(weekStart);
  const advances = s.input.ledger.filter((e) => e.type === "ADVANCE" && inWeek(e.date, weekStart));
  const rows = weeklyPay(s.input, s.weeks, weekStart);
  const crew = rows
    .map((r) => ({ workerId: r.workerId, name: r.name, days: r.days, earned: r.earned, advances: r.advances,
                   owedNow: balanceAt(s.input, s.weeks, r.workerId, today), status: r.status }))
    .filter((r) => r.days > 0 || r.advances !== 0 || r.owedNow !== 0 ||
                   s.input.workers.find((x) => x.id === r.workerId)?.status === "ACTIVE");
  return {
    weekStart, weekEnd: addDays(weekStart, 6), closed: s.closedWeeks.has(weekStart),
    kpis: {
      moulded: w?.moulded ?? 0, good: w?.good ?? 0, pot: w?.pot ?? 0, crewDays: w?.crewDays ?? 0,
      goodPerCrewDay: w?.goodPerCrewDay ?? null, rejectRate: w?.rejectRate ?? null,
      rejectAlarm: settingOn(s.input.settings, "REJECT_ALARM", weekStart),
      advancesCount: advances.length, advancesSum: advances.reduce((t, e) => t + e.amount, 0),
      owedToCrew: s.input.workers.reduce((t, x) => t + Math.max(0, balanceAt(s.input, s.weeks, x.id, today)), 0),
    },
    crew,
    issues: runChecks(s.input, s.weeks, today),
  };
}

// ---------- Kunlik jurnal ----------
export interface DaysView {
  weekStart: IsoDate;
  closed: boolean;
  workers: Array<{ id: string; code: string; name: string }>;
  rows: Array<{
    date: IsoDate; dayName: string; moulded: number | null; broken: number; notes: string | null;
    attendance: Record<string, number>; good: number; paidBlocks: number; crewDays: number; rate: number | null; payValue: number;
  }>;
  totals: { moulded: number; broken: number; good: number; pot: number; crewDays: number };
}

export function daysView(s: CrewState, weekStart: IsoDate): DaysView {
  const weekEnd = addDays(weekStart, 6);
  const workers = s.input.workers
    .filter((w) => w.joinedOn <= weekEnd && (!w.leftOn || w.leftOn >= weekStart))
    .map((w) => ({ id: w.id, code: w.code, name: w.name }));
  const rows = Array.from({ length: 7 }, (_, k) => {
    const date = addDays(weekStart, k);
    const day = s.input.days.find((d) => d.date === date) ?? { date, moulded: null, broken: 0, attendance: {} };
    const c = dayCalc(s.input, day);
    return {
      date, dayName: WEEKDAY_UZ[k], moulded: day.moulded, broken: day.broken, notes: s.dayNotes.get(date) ?? null,
      attendance: day.attendance, good: c.good, paidBlocks: c.paidBlocks, crewDays: c.crewDays, rate: c.rate, payValue: c.payValue,
    };
  });
  const w = s.weeks.get(weekStart);
  return {
    weekStart, closed: isLocked(s.closedWeeks, weekStart), workers, rows,
    totals: { moulded: w?.moulded ?? 0, broken: w?.broken ?? 0, good: w?.good ?? 0, pot: w?.pot ?? 0, crewDays: w?.crewDays ?? 0 },
  };
}

// ---------- Kassa ----------
export interface LedgerRowView extends EngineLedgerEntry, LedgerMeta {
  workerName: string;
  weekStart: IsoDate;
  balanceAfter: number;
  closed: boolean;
}
export interface LedgerView { entries: LedgerRowView[]; totals: Record<LedgerType, number> }

export function ledgerView(s: CrewState, f: { workerId?: string; type?: LedgerType; weekStart?: IsoDate }): LedgerView {
  const entries = s.input.ledger
    .filter((e) => (!f.workerId || e.workerId === f.workerId) && (!f.type || e.type === f.type) &&
                   (!f.weekStart || inWeek(e.date, f.weekStart)))
    .sort((a, b) => b.seq - a.seq)
    .map((e) => ({
      ...e,
      ...(s.ledgerMeta.get(e.id) ?? { method: "CASH" as const, reason: null, signed: false, reversesEntryId: null }),
      workerName: workerName(s, e.workerId),
      weekStart: weekStartOf(e.date),
      balanceAfter: balanceAt(s.input, s.weeks, e.workerId, e.date),
      closed: isLocked(s.closedWeeks, e.date),
    }));
  const totals: Record<LedgerType, number> = { ADVANCE: 0, WEEKLY_PAY: 0, CORRECTION: 0 };
  for (const e of entries) totals[e.type] += e.amount;
  return { entries, totals };
}

// ---------- Ish haqi ----------
export interface PayView {
  weekStart: IsoDate;
  weekEnd: IsoDate;
  closed: boolean;
  /** Read-only: this week lies on or before the last closed week. */
  locked: boolean;
  /** Only the newest closed week can be reopened. */
  canReopen: boolean;
  snapshot: unknown | null;
  debtCap: number;
  rows: PayRow[];
  totals: Pick<PayRow, "earned" | "advances" | "corrections" | "due" | "toPay" | "paid" | "stillToPay" | "carriedForward">;
  blockers: CrewIssue[];
}

export function payView(s: CrewState, weekStart: IsoDate, today: IsoDate): PayView {
  const all = weeklyPay(s.input, s.weeks, weekStart);
  const rows = all.filter((r) => {
    const w = s.input.workers.find((x) => x.id === r.workerId)!;
    const touched = r.days > 0 || r.broughtForward !== 0 || r.advances !== 0 || r.corrections !== 0 || r.paid !== 0 || r.carriedForward !== 0;
    return w.status === "ACTIVE" ? activeOn(w, addDays(weekStart, 6)) || touched : touched;
  });
  const sum = (k: keyof PayView["totals"]) => rows.reduce((t, r) => t + r[k], 0);
  return {
    weekStart, weekEnd: addDays(weekStart, 6), closed: s.closedWeeks.has(weekStart),
    locked: isLocked(s.closedWeeks, weekStart),
    canReopen: s.closedWeeks.has(weekStart) && [...s.closedWeeks].sort().at(-1) === weekStart,
    snapshot: s.snapshots.get(weekStart) ?? null,
    debtCap: settingOn(s.input.settings, "DEBT_CAP", weekStart) ?? 1,
    rows,
    totals: {
      earned: sum("earned"), advances: sum("advances"), corrections: sum("corrections"), due: sum("due"),
      toPay: sum("toPay"), paid: sum("paid"), stillToPay: sum("stillToPay"), carriedForward: sum("carriedForward"),
    },
    blockers: closeBlockers(runChecks(s.input, s.weeks, today), weekStart),
  };
}

/** Latest week with production that is not closed, else the current week. */
export function defaultPayWeek(s: CrewState, today: IsoDate): IsoDate {
  const open = [...s.weeks.keys()].filter((ws) => !s.closedWeeks.has(ws) && ws <= today).sort();
  return open.at(-1) ?? weekStartOf(today);
}

// ---------- Ishchilar ----------
export interface WorkersView {
  workers: Array<{ id: string; code: string; name: string; status: "ACTIVE" | "LEFT"; joinedOn: IsoDate; leftOn: IsoDate | null;
                   phone: string | null; notes: string | null; owedNow: number }>;
  nextCode: string;
}

export function workersView(s: CrewState, today: IsoDate): WorkersView {
  const max = s.input.workers.reduce((m, w) => Math.max(m, Number(w.code.slice(1)) || 0), 0);
  return {
    workers: s.input.workers.map((w) => ({
      ...w, ...(s.workerMeta.get(w.id) ?? { phone: null, notes: null }),
      owedNow: balanceAt(s.input, s.weeks, w.id, today),
    })),
    nextCode: `W${String(max + 1).padStart(2, "0")}`,
  };
}

export interface WorkerHistoryView {
  worker: { id: string; name: string; code: string };
  weeks: Array<{ weekStart: IsoDate; days: number; earned: number; advances: number; corrections: number; paid: number; endBalance: number }>;
  entries: LedgerRowView[];
}

export function workerHistoryView(s: CrewState, workerId: string): WorkerHistoryView {
  const w = s.input.workers.find((x) => x.id === workerId)!;
  const starts = new Set<IsoDate>([...s.weeks.keys()]);
  for (const e of s.input.ledger) if (e.workerId === workerId) starts.add(weekStartOf(e.date));
  const weeks = [...starts].sort().map((ws) => {
    const r = weeklyPay(s.input, s.weeks, ws).find((x) => x.workerId === workerId)!;
    return { weekStart: ws, days: r.days, earned: r.earned, advances: r.advances, corrections: r.corrections, paid: r.paid, endBalance: r.carriedForward };
  });
  return { worker: { id: w.id, name: w.name, code: w.code }, weeks, entries: ledgerView(s, { workerId }).entries };
}

// ---------- Sozlamalar ----------
export interface SettingsView {
  rates: Array<{ effectiveFrom: IsoDate; ratePerBlock: number }>;
  settings: Array<{ key: "BREAK_ALLOWANCE" | "DEBT_CAP" | "REJECT_ALARM"; value: number; effectiveFrom: IsoDate }>;
  lastClosedWeek: IsoDate | null;
}

export function settingsView(s: CrewState): SettingsView {
  return {
    rates: [...s.input.rates].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
    settings: [...s.input.settings].sort((a, b) => a.key.localeCompare(b.key) || b.effectiveFrom.localeCompare(a.effectiveFrom)),
    lastClosedWeek: [...s.closedWeeks].sort().at(-1) ?? null,
  };
}

// ---------- Payslip ----------
export interface PayslipView {
  worker: { id: string; name: string; code: string };
  weekStart: IsoDate;
  weekEnd: IsoDate;
  row: PayRow;
  advances: LedgerRowView[];
  corrections: LedgerRowView[];
  payments: LedgerRowView[];
}

export function payslipView(s: CrewState, weekStart: IsoDate, workerId: string): PayslipView {
  const w = s.input.workers.find((x) => x.id === workerId)!;
  const row = weeklyPay(s.input, s.weeks, weekStart).find((r) => r.workerId === workerId)!;
  const entries = ledgerView(s, { workerId, weekStart }).entries.sort((a, b) => a.seq - b.seq);
  return {
    worker: { id: w.id, name: w.name, code: w.code }, weekStart, weekEnd: addDays(weekStart, 6), row,
    advances: entries.filter((e) => e.type === "ADVANCE"),
    corrections: entries.filter((e) => e.type === "CORRECTION"),
    payments: entries.filter((e) => e.type === "WEEKLY_PAY"),
  };
}
