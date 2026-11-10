/**
 * Gazoblok orders calendar — month grid, per-day buckets and the month
 * bounds the API reads. Pure and browser-safe: the route, the screen and the
 * tests share it.
 *
 * Same rule as the beam-and-block calendar (src/lib/calendar-day.ts): an order
 * lives whole on its scheduled day; trucks never move it. Days are local
 * (server TZ=Asia/Tashkent), like the rest of the system.
 */
import { dayKey } from "@/lib/dashboard-metrics";
import { monthGridWeeks } from "@/lib/calendar-grid";
import { unpaidOverload } from "@/lib/gazoblok-quantities";

export type CalendarFlags = {
  /** Some order that day has over-load surcharge still unpaid. */
  debt: boolean;
  /** Some order that day still owes money. */
  unpaid: boolean;
};
export type CalendarDay = { date: string; orders: number; blocks: number; flags: CalendarFlags };
export type GazoblokCalendar = { month: string; days: CalendarDay[]; unscheduledOpen: number };

export type CalendarRow = {
  status: string;
  scheduledAt: Date | null;
  totalBlocks: number;
  totalPrice: number;
  confirmedPaid: number;
  overshipAmount: number;
};

/** "YYYY-MM" → { year, month (1–12) }; anything else → null. */
export function parseMonthParam(v: string | null): { year: number; month: number } | null {
  const m = v?.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? { year: Number(m[1]), month } : null;
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** Local midnight of the 1st → local midnight of the next month's 1st (exclusive). */
export function monthBounds(year: number, month: number): { start: Date; end: Date } {
  return { start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
}

export function shiftMonth(key: string, n: number): string {
  const p = parseMonthParam(key);
  if (!p) return key;
  const d = new Date(p.year, p.month - 1 + n, 1);
  return monthKey(d.getFullYear(), d.getMonth() + 1);
}

/** Monday-first cells for the month, only the weeks it needs (4–6), as the CRM calendar draws them. */
export function monthCells(year: number, month: number): { key: string; day: number; inMonth: boolean }[] {
  const first = new Date(year, month - 1, 1);
  const leading = (first.getDay() + 6) % 7;
  const count = monthGridWeeks(first) * 7;
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(year, month - 1, 1 - leading + i);
    return { key: dayKey(d), day: d.getDate(), inMonth: d.getMonth() === month - 1 };
  });
}

/** Per scheduled day: whole orders, their blocks and the money markers. Cancelled and undated orders are left out. */
export function calendarDays(rows: CalendarRow[]): CalendarDay[] {
  const byDay = new Map<string, CalendarDay>();
  for (const r of rows) {
    if (r.status === "CANCELED" || !r.scheduledAt) continue;
    const date = dayKey(r.scheduledAt);
    const d = byDay.get(date) ?? { date, orders: 0, blocks: 0, flags: { debt: false, unpaid: false } };
    d.orders += 1;
    d.blocks += r.totalBlocks;
    // Compare in tiyin so float noise (0.1 + 0.2) never reads as a debt.
    if (Math.round(r.totalPrice * 100) - Math.round(r.confirmedPaid * 100) > 0) d.flags.unpaid = true;
    if (unpaidOverload(r) > 0.005) d.flags.debt = true;
    byDay.set(date, d);
  }
  return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/** "2026-11-01" → "01.11", the filter chip's short date. */
export function dayChipLabel(key: string): string {
  return `${key.slice(8, 10)}.${key.slice(5, 7)}`;
}
