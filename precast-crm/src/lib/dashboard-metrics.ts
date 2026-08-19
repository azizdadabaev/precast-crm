/**
 * Pure arithmetic + bucketing helpers behind the dashboard's money metrics.
 * Deliberately Prisma-free so the maths is unit-testable (see
 * `dashboard-metrics.test.ts`).
 *
 * ── The two money metrics ──────────────────────────────────────────────
 * The dashboard used to ship two different numbers both labelled "revenue".
 * They are NOT interchangeable and neither may be called bare
 * "revenue" / "даромад" anywhere in the code or the UI:
 *
 *   • BOOKED    «Буюртма қилинган · Booked»
 *     Σ Order.totalPrice over live orders, bucketed by `Order.placedAt`.
 *     What the business SOLD in a period.
 *
 *   • COLLECTED «Тушган пул · Collected»
 *     Σ Payment.amount over CONFIRMED payments, bucketed by
 *     `Payment.confirmedAt`. What the business actually RECEIVED.
 *
 * Booked − Collected is (roughly) the outstanding receivable, which is why
 * the two numbers never agreed.
 *
 * `Order.confirmedPaid` is a running total with NO date attached, so it can
 * never answer "how much cash arrived in May" — any collections time series
 * has to come off the Payment table.
 *
 * ── Timezone ──────────────────────────────────────────────────────────
 * Every bucket key is built from the server's LOCAL calendar fields
 * (`getFullYear`/`getMonth`/`getDate`). Production runs with
 * `TZ=Asia/Tashkent`; local dates are stored as the previous day 19:00Z, so
 * UTC bucketing / `date_trunc` would shift every date by one day.
 */

/** Short Uzbek Cyrillic month names, indexed by `Date#getMonth()`. */
export const MONTH_UZ_SHORT = [
  'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн',
  'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек',
] as const;

/** `YYYY-MM` in the server's local zone. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** `YYYY-MM-DD` in the server's local zone. */
export function dayKey(d: Date): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

export interface MonthBucket {
  /** `YYYY-MM` — join key for accumulated sums. */
  key: string;
  /** Uzbek Cyrillic short label for the x-axis. */
  label: string;
  year: number;
  /** 0-indexed, as `Date#getMonth()`. */
  monthIndex: number;
}

/**
 * `months` contiguous buckets ending with the month that contains `now`,
 * ordered oldest → newest. Empty months still get a bucket so a line chart
 * keeps a continuous x-axis.
 */
export function monthWindow(now: Date, months: number): MonthBucket[] {
  const out: MonthBucket[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: monthKey(d),
      label: MONTH_UZ_SHORT[d.getMonth()]!,
      year: d.getFullYear(),
      monthIndex: d.getMonth(),
    });
  }
  return out;
}

export interface MonthTotal {
  total: number;
  count: number;
}

/**
 * Sum `getAmount` into local-calendar month buckets. Rows whose date is
 * null are skipped and reported nowhere — e.g. a CONFIRMED payment with no
 * `confirmedAt` cannot be attributed to a month, so it contributes to the
 * all-time collected total but to no bucket.
 */
export function accumulateByMonth<T>(
  rows: readonly T[],
  getDate: (row: T) => Date | null,
  getAmount: (row: T) => number,
): Map<string, MonthTotal> {
  const map = new Map<string, MonthTotal>();
  for (const row of rows) {
    const d = getDate(row);
    if (!d) continue;
    const key = monthKey(d);
    const cur = map.get(key) ?? { total: 0, count: 0 };
    cur.total += getAmount(row);
    cur.count += 1;
    map.set(key, cur);
  }
  return map;
}

/**
 * Average order value = booked value per order.
 *
 * The numerator is Σ `totalPrice` (BOOKED), never Σ `confirmedPaid` — an
 * order that has not been paid yet still has a value, and dividing
 * collections by order count answers a different question entirely
 * ("collections per order"), which is not AOV.
 *
 * Rounded to whole UZS; returns 0 rather than NaN/Infinity on an empty set.
 */
export function averageOrderValue(bookedTotal: number, orderCount: number): number {
  if (orderCount <= 0) return 0;
  return Math.round(bookedTotal / orderCount);
}

/**
 * Outstanding receivable on a single order:
 * `max(0, totalPrice − confirmedPaid − writeOffAmount)`.
 *
 * A write-off flips an order to FULLY_PAID while the cash is short, so
 * `paymentState` is never a proxy for "we received the money" — only this
 * subtraction is.
 */
export function outstandingAmount(row: {
  totalPrice: number;
  confirmedPaid: number;
  writeOffAmount: number;
}): number {
  const due = row.totalPrice - row.confirmedPaid - row.writeOffAmount;
  return due > 0 ? due : 0;
}

/**
 * Number of distinct values. Used to count CUSTOMERS rather than order
 * rows — `groupBy(paymentState)._count.clientId` counts rows, so a client
 * with six orders was previously counted six times under a "customers"
 * label.
 */
export function countDistinct(values: Iterable<string>): number {
  return new Set(values).size;
}

/**
 * Trend pill data. `deltaPct` is rounded to whole percent. `direction`
 * derives from the sign — "flat" when |delta| < 1% so we don't flash a
 * pill for noise. `polarity` controls the green/red color in the UI:
 * "positive" means an up arrow is good (booked/collected), "negative"
 * means an up arrow is bad (receivables).
 */
export interface Trend {
  deltaPct: number;
  direction: 'up' | 'down' | 'flat';
  polarity: 'positive' | 'negative';
}

/**
 * Build a trend pill from a current vs previous-period number pair.
 * Returns null when there's no previous-period basis (the first month
 * of operation, or any case where dividing by zero is meaningless).
 * |delta| < 1% renders as a flat arrow so noise doesn't trigger
 * green/red flashing.
 *
 * Lives here (not in `dashboard-data.ts`) because the dashboard page
 * recomputes these client-side when the operator selects a month other
 * than the current one — the server can only precompute the
 * current-vs-previous pair.
 */
export function buildTrend(
  current: number,
  previous: number,
  polarity: Trend['polarity'],
): Trend | null {
  if (previous <= 0) return null;
  const deltaPct = Math.round(((current - previous) / previous) * 100);
  const direction: Trend['direction'] =
    Math.abs(deltaPct) < 1 ? 'flat' : deltaPct > 0 ? 'up' : 'down';
  return { deltaPct, direction, polarity };
}
