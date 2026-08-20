import { describe, it, expect } from 'vitest';
import { buildMonthDays, todayMarkerFor, type DailyBucket } from './month-days';

// The reported symptom: on the delivery basis, August showed solid bars on
// days 21-29 as though those deliveries had already happened. Today is the
// 20th in every test below.
const NOW = new Date(2026, 7, 20, 14, 30);

const bucket = (day: number, orders: number, booked: number): DailyBucket => ({
  date: new Date(2026, 7, day).getTime(),
  monthKey: '2026-08',
  orderCount: orders,
  booked,
});

describe('buildMonthDays', () => {
  it('covers every day of the month, zero-filling the quiet ones', () => {
    const days = buildMonthDays('2026-08', [bucket(3, 2, 100)], NOW);
    expect(days).toHaveLength(31);
    expect(days[0]).toMatchObject({ day: 1, orders: 0, booked: 0 });
    expect(days[2]).toMatchObject({ day: 3, orders: 2, booked: 100 });
  });

  it('flags days after today as future and days before as not', () => {
    const days = buildMonthDays('2026-08', [], NOW);
    expect(days.find((d) => d.day === 19)!.future).toBe(false);
    expect(days.find((d) => d.day === 21)!.future).toBe(true);
    expect(days.find((d) => d.day === 29)!.future).toBe(true);
  });

  it('treats today itself as NOT future', () => {
    // The day is in progress and a delivery scheduled for it may already
    // have gone out; hollowing it would be wrong.
    expect(buildMonthDays('2026-08', [], NOW).find((d) => d.day === 20)!.future).toBe(false);
  });

  it('marks the whole of a past month as settled', () => {
    const july = buildMonthDays(
      '2026-07',
      [{ ...bucket(5, 1, 10), monthKey: '2026-07', date: new Date(2026, 6, 5).getTime() }],
      NOW,
    );
    expect(july).toHaveLength(31);
    expect(july.every((d) => d.future === false)).toBe(true);
  });

  it('marks the whole of a future month as not yet happened', () => {
    // September on the delivery basis carries real committed work.
    const sep = buildMonthDays('2026-09', [], NOW);
    expect(sep).toHaveLength(30);
    expect(sep.every((d) => d.future === true)).toBe(true);
  });

  it('ignores buckets belonging to another month', () => {
    const foreign: DailyBucket = {
      date: new Date(2026, 8, 4).getTime(),
      monthKey: '2026-09',
      orderCount: 9,
      booked: 999,
    };
    const days = buildMonthDays('2026-08', [bucket(4, 1, 50), foreign], NOW);
    expect(days.find((d) => d.day === 4)!.orders).toBe(1);
    expect(days.reduce((s, d) => s + d.orders, 0)).toBe(1);
  });

  it('sums several buckets landing on the same day', () => {
    const days = buildMonthDays('2026-08', [bucket(7, 2, 100), bucket(7, 3, 250)], NOW);
    expect(days.find((d) => d.day === 7)).toMatchObject({ orders: 5, booked: 350 });
  });

  it('gets month lengths right, including February in a leap year', () => {
    expect(buildMonthDays('2026-02', [], NOW)).toHaveLength(28);
    expect(buildMonthDays('2024-02', [], NOW)).toHaveLength(29);
    expect(buildMonthDays('2026-04', [], NOW)).toHaveLength(30);
  });

  it('returns nothing rather than throwing on missing or malformed input', () => {
    expect(buildMonthDays(undefined, [], NOW)).toEqual([]);
    expect(buildMonthDays('2026-08', undefined, NOW)).toEqual([]);
    expect(buildMonthDays('rubbish', [], NOW)).toEqual([]);
  });

  it('reproduces the reported August case end to end', () => {
    // Deliveries scheduled across the month, some already done, some not.
    const days = buildMonthDays(
      '2026-08',
      [bucket(17, 4, 40e6), bucket(20, 3, 30e6), bucket(21, 5, 50e6), bucket(27, 2, 20e6)],
      NOW,
    );
    const solid = days.filter((d) => !d.future && d.orders > 0).map((d) => d.day);
    const hollow = days.filter((d) => d.future && d.orders > 0).map((d) => d.day);
    expect(solid).toEqual([17, 20]);
    expect(hollow).toEqual([21, 27]);
    // The figures themselves are untouched — only how they are drawn changes.
    expect(days.reduce((s, d) => s + d.orders, 0)).toBe(14);
  });
});

describe('todayMarkerFor', () => {
  it('returns the day number when the selected month contains today', () => {
    expect(todayMarkerFor('2026-08', NOW)).toBe(20);
  });

  it('returns null for any other month, so no line is drawn', () => {
    expect(todayMarkerFor('2026-07', NOW)).toBeNull();
    expect(todayMarkerFor('2026-09', NOW)).toBeNull();
    expect(todayMarkerFor('2025-08', NOW)).toBeNull();
    expect(todayMarkerFor(undefined, NOW)).toBeNull();
  });
});
