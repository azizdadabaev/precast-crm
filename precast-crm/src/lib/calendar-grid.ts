/**
 * Rows a Monday-first month grid needs: the leading days of the first week
 * plus the month's own days, rounded up to whole weeks — 4, 5 or 6. A sixth
 * row made entirely of next month's days is never drawn (owner ruling, same
 * as the Android calendar's R16).
 */
export function monthGridWeeks(anyDayInMonth: Date): number {
  const first = new Date(anyDayInMonth.getFullYear(), anyDayInMonth.getMonth(), 1);
  const leading = (first.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return Math.ceil((leading + daysInMonth) / 7);
}
