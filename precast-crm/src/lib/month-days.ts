// Per-day series for the hero chart's month view.
//
// Split out of HeroChart so the future/past rule is testable: on the DELIVERY
// basis a bar can sit in the future, because `scheduledAt` is a promise rather
// than an event. Drawing such a day like a completed one asserts a delivery
// happened that has not. `placedAt` can never be in the future, so on the
// order basis nothing is ever flagged.

export interface DayPoint {
  day: number;
  orders: number;
  booked: number;
  /** Scheduled but not yet reached. Drawn hollow. */
  future: boolean;
}

export interface DailyBucket {
  /** Epoch ms of local midnight for the day. */
  date: number;
  /** `YYYY-MM`, LOCAL. */
  monthKey: string;
  orderCount: number;
  booked: number;
}

/**
 * Zero-filled days for `monthKey`, each flagged past or future against `now`.
 *
 * Zero-filling matters: the API returns only days that had activity, and an
 * absent day is a real zero, not a gap to interpolate across.
 *
 * TODAY IS NOT FUTURE. A delivery scheduled for today may already have gone
 * out, and the day is still in progress either way, so it stays solid — the
 * line is drawn strictly after today.
 */
export function buildMonthDays(
  monthKey: string | undefined,
  buckets: DailyBucket[] | undefined,
  now: Date,
): DayPoint[] {
  if (!monthKey || !buckets) return [];
  const [year, month] = monthKey.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return [];

  const byDay = new Map<number, { orders: number; booked: number }>();
  for (const b of buckets) {
    if (b.monthKey !== monthKey) continue;
    const dayNum = new Date(b.date).getDate();
    if (!Number.isFinite(dayNum)) continue;
    const cur = byDay.get(dayNum) ?? { orders: 0, booked: 0 };
    cur.orders += b.orderCount;
    cur.booked += b.booked;
    byDay.set(dayNum, cur);
  }

  // `new Date(y, m, 0)` is the last day of month `m` — month is 1-based here.
  const daysInMonth = new Date(year, month, 0).getDate();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;
  const isThisMonth = year === nowYear && month === nowMonth;
  const isPastMonth = year < nowYear || (year === nowYear && month < nowMonth);
  const today = now.getDate();

  return Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    return {
      day,
      orders: byDay.get(day)?.orders ?? 0,
      booked: byDay.get(day)?.booked ?? 0,
      future: isPastMonth ? false : isThisMonth ? day > today : true,
    };
  });
}

/**
 * Day-of-month to draw the «бугун» line on, or null when today is not in the
 * selected month — a marker in a month that does not contain today would be
 * pointing at nothing.
 */
export function todayMarkerFor(monthKey: string | undefined, now: Date): number | null {
  if (!monthKey) return null;
  const [year, month] = monthKey.split('-').map(Number);
  if (year !== now.getFullYear() || month !== now.getMonth() + 1) return null;
  return now.getDate();
}
