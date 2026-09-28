// The workbook's "Checks" sheet as data: errors block closing a week,
// warnings inform. Messages are Uzbek Cyrillic (owner-facing).
import {
  FIRST_WEEK_START, SHARE_DRIFT_TOLERANCE, addDays, balanceAt, dayCalc, settingOn, weekStartOf,
  type EngineInput, type IsoDate, type WeekCalc,
} from "./engine";
import { activeOn } from "./rules";
import { fmtDay, fmtPct, fmtSom } from "./format";

export interface CrewIssue {
  level: "error" | "warning";
  code: string;
  message: string;
  weekStart?: IsoDate;
  date?: IsoDate;
  workerId?: string;
  entryId?: string;
}

const UNPAID_AFTER_DAYS = 14;   // Labour Code Art. 253: pay at least every half-month
const OLD_DEBT_DAYS = 30;       // Art. 269: recover an advance within one month

export function runChecks(input: EngineInput, weeks: Map<IsoDate, WeekCalc>, today: IsoDate): CrewIssue[] {
  const out: CrewIssue[] = [];
  const nameOf = (id: string) => input.workers.find((w) => w.id === id)?.name ?? id;

  if (!input.rates.some((r) => r.ratePerBlock > 0)) {
    out.push({ level: "error", code: "NO_RATE", message: "Ставка киритилмаган — Созламаларда блок учун нархни киритинг" });
  }
  const rates = [...input.rates].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  for (let k = 1; k < rates.length; k++) {
    if (rates[k].ratePerBlock < rates[k - 1].ratePerBlock) {
      out.push({ level: "warning", code: "RATE_CUT", date: rates[k].effectiveFrom,
        message: `${fmtDay(rates[k].effectiveFrom)} дан ставка пасайтирилган — қонун бўйича ишчилар 2 ой олдин ёзма огоҳлантирилиши керак` });
    }
  }

  for (const day of input.days) {
    const c = dayCalc(input, day);
    const at = { date: day.date, weekStart: c.weekStart };
    if (c.broken > c.moulded) out.push({ level: "error", code: "BROKEN_GT_MOULDED", ...at, message: `${fmtDay(day.date)}: синган блоклар қолипланганидан кўп` });
    if (c.moulded > 0 && c.crewDays === 0) out.push({ level: "error", code: "NOBODY_PRESENT", ...at, message: `${fmtDay(day.date)}: блок бор, лекин ҳеч ким келган деб белгиланмаган` });
    if (c.moulded > 0 && c.rate == null) out.push({ level: "error", code: "NO_RATE_FOR_DAY", ...at, message: `${fmtDay(day.date)}: бу сана учун ставка йўқ` });
    if (!day.moulded && c.crewDays > 0) out.push({ level: "warning", code: "ATTENDANCE_NO_BLOCKS", ...at, message: `${fmtDay(day.date)}: давомат бор, лекин блок сони киритилмаган` });
    for (const workerId of Object.keys(day.attendance)) {
      const w = input.workers.find((x) => x.id === workerId);
      if (w && !activeOn(w, day.date)) {
        out.push({ level: "error", code: "INACTIVE_WORKER", ...at, workerId, message: `${fmtDay(day.date)}: ${w.name} бу санада ишламаган, лекин давомат белгиланган` });
      }
    }
  }

  for (const w of weeks.values()) {
    // A pot with no attendance is NOBODY_PRESENT (per day), not a rounding drift.
    if (w.crewDays > 0 && Math.abs(w.shareDrift) > SHARE_DRIFT_TOLERANCE) {
      out.push({ level: "error", code: "SHARE_DRIFT", weekStart: w.weekStart, message: `${fmtDay(w.weekStart)} ҳафтаси: улушлар жами ҳафта пулидан ${fmtSom(w.shareDrift)} сўм фарқ қилади` });
    }
    const alarm = settingOn(input.settings, "REJECT_ALARM", w.weekStart);
    if (alarm != null && w.rejectRate != null && w.rejectRate > alarm) {
      out.push({ level: "warning", code: "REJECT_HIGH", weekStart: w.weekStart, message: `${fmtDay(w.weekStart)} ҳафтаси: брак ${fmtPct(w.rejectRate)} — чегара ${fmtPct(alarm)}` });
    }
  }

  // Money earned in weeks that ended 14+ days ago and still not handed over.
  // Compared against ALL cash to date, not one week's "paid" column: a week
  // paid late is dated in the next week (workbook rule), so a per-week check
  // would flag it forever (live data: week 31.08 was paid on 09.09).
  const cutoff = addDays(today, -UNPAID_AFTER_DAYS);
  for (const worker of input.workers) {
    let earnedOld = 0;
    for (const w of weeks.values()) if (w.weekEnd <= cutoff) earnedOld += w.shares[worker.id] ?? 0;
    const unpaid = earnedOld - input.ledger.reduce((s, e) => (e.workerId === worker.id && e.date <= today ? s + e.amount : s), 0);
    if (unpaid > 0) {
      out.push({ level: "warning", code: "WEEK_UNPAID", workerId: worker.id,
        message: `${worker.name}: ${UNPAID_AFTER_DAYS} кундан олдин ишлаган ${fmtSom(unpaid)} сўми ҳали тўланмаган` });
    }
  }

  for (const e of input.ledger) {
    if (e.type !== "ADVANCE") continue;
    const bal = balanceAt(input, weeks, e.workerId, e.date);
    if (bal < 0) {
      out.push({ level: "warning", code: "ADVANCE_OVER_BALANCE", date: e.date, weekStart: weekStartOf(e.date), workerId: e.workerId, entryId: e.id,
        message: `${fmtDay(e.date)}: ${nameOf(e.workerId)}га аванс ишлаганидан кўп — ${fmtSom(-bal)} сўм қарз бўлди` });
    }
  }

  const monthAgo = addDays(today, -OLD_DEBT_DAYS);
  if (monthAgo >= FIRST_WEEK_START) {
    for (const w of input.workers) {
      const now = balanceAt(input, weeks, w.id, today);
      if (now < 0 && balanceAt(input, weeks, w.id, monthAgo) < 0) {
        out.push({ level: "warning", code: "OLD_DEBT", workerId: w.id,
          message: `${w.name} ${OLD_DEBT_DAYS} кундан бери қарздор (${fmtSom(-now)} сўм) — ёзма келишув ёки ушлаб қолиш буйруғи керак` });
      }
    }
  }
  return out;
}

/** Errors that stop closing `weekStart`: global ones, and any in this week or earlier. */
export function closeBlockers(issues: CrewIssue[], weekStart: IsoDate): CrewIssue[] {
  return issues.filter((i) => i.level === "error" && (!i.weekStart || i.weekStart <= weekStart));
}
