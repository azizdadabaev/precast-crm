// Pure write rules for crew pay. The service calls these inside its
// transactions; a violation throws CrewPayError, which crewRoute turns into
// JSON with an Uzbek message.
import { FIRST_WEEK_START, addDays, dayCalc, weekStartOf, type EngineInput, type EngineWorker, type IsoDate, type LedgerType } from "./engine";
import { fmtDay } from "./format";

export class CrewPayError extends Error {
  constructor(message: string, readonly status: number = 422) {
    super(message);
    this.name = "CrewPayError";
  }
}

export const CLOSED_WEEK_MESSAGE = "Бу ҳафта ёпилган — аввал қайта очинг · This week is closed";

const FUTURE_DATE = "Келажакдаги санага ёзиб бўлмайди — бугунги ёки ўтган санани танланг";
const BEFORE_FIRST_WEEK = `Сана ${fmtDay(FIRST_WEEK_START)}.2026 дан олдин бўлиши мумкин эмас`;

/** Calendar date in Asia/Tashkent (the plant's business day). */
export function todayTashkent(now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(now);
}

export const isMonday = (d: IsoDate) => weekStartOf(d) === d;

/** Clamp `date` into [weekStart, weekStart+6]: the workbook's MEDIAN(S, E, TODAY()). */
export function clampToWeek(date: IsoDate, weekStart: IsoDate): IsoDate {
  const end = addDays(weekStart, 6);
  return date < weekStart ? weekStart : date > end ? end : date;
}

const lastClosedWeek = (closed: ReadonlySet<IsoDate>): IsoDate | undefined => [...closed].sort().at(-1);

/**
 * Everything up to the end of the last closed week is locked, not just the
 * closed weeks themselves: a week's brought-forward depends on every earlier
 * week, so editing an open week that lies BEFORE a closed one would silently
 * change the closed week's TO PAY and status.
 */
export function isLocked(closed: ReadonlySet<IsoDate>, date: IsoDate): boolean {
  const last = lastClosedWeek(closed);
  return !!last && date <= addDays(last, 6);
}

export function assertWeeksOpen(closed: ReadonlySet<IsoDate>, dates: IsoDate[]): void {
  for (const d of dates) {
    if (!isLocked(closed, d)) continue;
    if (closed.has(weekStartOf(d))) throw new CrewPayError(CLOSED_WEEK_MESSAGE, 409);
    throw new CrewPayError(
      `Кейинги ҳафта ёпилган — бу санани ўзгартириш учун аввал ${fmtDay(lastClosedWeek(closed)!)} ҳафтасини қайта очинг`,
      409,
    );
  }
}

/** A rate/setting may only start after the last closed week, or it would change a paid week. */
export function assertEffectiveDateAllowed(closed: ReadonlySet<IsoDate>, date: IsoDate): void {
  if (date < FIRST_WEEK_START) throw new CrewPayError(BEFORE_FIRST_WEEK);
  if (isLocked(closed, date)) {
    throw new CrewPayError(
      `Ёпилган ҳафталарни ўзгартирмаслик учун сана ${fmtDay(addDays(lastClosedWeek(closed)!, 7))} дан кейин бўлиши керак`,
      409,
    );
  }
}

/** Weeks reopen newest-first, so a reopened week never sits under a still-closed one. */
export function assertCanReopen(closed: ReadonlySet<IsoDate>, weekStart: IsoDate): void {
  const last = lastClosedWeek(closed);
  if (!closed.has(weekStart)) throw new CrewPayError("Бу ҳафта ёпилмаган", 409);
  if (weekStart !== last) throw new CrewPayError(`Аввал охирги ёпилган ҳафтани (${fmtDay(last!)}) қайта очинг`, 409);
}

export function activeOn(w: EngineWorker, date: IsoDate): boolean {
  return w.joinedOn <= date && (!w.leftOn || date <= w.leftOn);
}

export interface DayWrite {
  date: IsoDate;
  moulded: number | null;
  broken: number;
  /** workerId → 1 or 0.5 (absent workers omitted). */
  attendance: Record<string, number>;
  notes?: string | null;
}

export function validateDayWrite(day: DayWrite, input: EngineInput, opts: { confirmNoAttendance?: boolean; today?: IsoDate }): void {
  if (day.date < FIRST_WEEK_START) throw new CrewPayError(BEFORE_FIRST_WEEK);
  if (opts.today && day.date > opts.today) throw new CrewPayError(FUTURE_DATE);
  if (day.moulded != null && day.broken > day.moulded) throw new CrewPayError("Синган блоклар қолипланганидан кўп бўлиши мумкин эмас");
  if (day.moulded == null && day.broken > 0) throw new CrewPayError("Аввал қолипланган блоклар сонини киритинг");
  for (const [workerId, v] of Object.entries(day.attendance)) {
    if (v !== 1 && v !== 0.5) throw new CrewPayError("Давомат фақат 1 ёки 0,5 бўлиши мумкин");
    const w = input.workers.find((x) => x.id === workerId);
    if (!w) throw new CrewPayError("Номаълум ишчи");
    if (!activeOn(w, day.date)) throw new CrewPayError(`${w.name}: бу санада ишламаётган ишчига давомат белгилаб бўлмайди`);
  }
  const calc = dayCalc(input, { date: day.date, moulded: day.moulded, broken: day.broken, attendance: day.attendance });
  if ((day.moulded ?? 0) > 0 && calc.rate == null) throw new CrewPayError("Бу сана учун ставка йўқ — Созламаларда ставка киритинг");
  if ((day.moulded ?? 0) > 0 && calc.crewDays === 0 && !opts.confirmNoAttendance) {
    throw new CrewPayError("Блок бор, лекин ҳеч ким келган деб белгиланмаган — пул тақсимланмайди");
  }
}

export interface LedgerWrite {
  date: IsoDate;
  workerId: string;
  type: LedgerType;
  amount: number;
}

export function validateLedgerWrite(e: LedgerWrite, today?: IsoDate): void {
  if (e.date < FIRST_WEEK_START) throw new CrewPayError(BEFORE_FIRST_WEEK);
  if (today && e.date > today) throw new CrewPayError(FUTURE_DATE);
  if (!Number.isInteger(e.amount) || e.amount === 0) throw new CrewPayError("Сумма бутун сон ва нолдан фарқли бўлиши керак");
  if (e.amount < 0 && e.type !== "CORRECTION") throw new CrewPayError("Манфий сумма фақат «Тузатиш» учун — хатони тузатиш билан қайтаринг");
}

export interface PayRequest {
  workerId: string;
  amount: number;
  method: "CASH" | "CARD" | "OFFSET" | "OTHER";
  clientKey: string;
}

/** Drop zero amounts and any clientKey already stored or repeated: a double click pays once. */
export function planPayments(existingKeys: ReadonlySet<string>, requests: PayRequest[]): PayRequest[] {
  const seen = new Set(existingKeys);
  const out: PayRequest[] = [];
  for (const r of requests) {
    if (r.amount <= 0 || seen.has(r.clientKey)) continue;
    seen.add(r.clientKey);
    out.push(r);
  }
  return out;
}
