// Every order in one calendar month, for the modal behind «Барчаси →».
//
// Kept out of the route so the month-bounds arithmetic — the part that is easy
// to get wrong and impossible to see once deployed — is unit-tested.

/** `YYYY-MM`, exactly as the dashboard keys its buckets. */
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthKey(value: string | null | undefined): value is string {
  return typeof value === 'string' && MONTH_RE.test(value);
}

/**
 * Inclusive local start/end instants for a `YYYY-MM`.
 *
 * LOCAL, never UTC. The app runs at `TZ=Asia/Tashkent` (+05) and `scheduledAt`
 * stores a local date as the previous day 19:00Z, so a UTC month boundary
 * would pull the last evening of one month into the next. Every other bucket
 * in this codebase is built the same way — see dashboard-metrics.
 *
 * `new Date(y, m, 0)` is the last day of month `m` when `m` is 1-based, which
 * handles 30/31-day months and February in a leap year without a table.
 */
export function monthBounds(monthKey: string): { start: Date; end: Date } {
  const [year, month] = monthKey.split('-').map(Number);
  return {
    start: new Date(year, month - 1, 1, 0, 0, 0, 0),
    end: new Date(year, month, 0, 23, 59, 59, 999),
  };
}

/** Step a `YYYY-MM` by whole months, rolling the year over correctly. */
export function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTH_NAMES_UZ = [
  'Январ', 'Феврал', 'Март', 'Апрел', 'Май', 'Июн',
  'Июл', 'Август', 'Сентябр', 'Октябр', 'Ноябр', 'Декабр',
];

/** «Август 2026» — full month name, unlike the chart's abbreviated axis. */
export function monthTitle(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return `${MONTH_NAMES_UZ[month - 1]} ${year}`;
}
