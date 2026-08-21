import { describe, it, expect } from 'vitest';
import { isMonthKey, monthBounds, monthTitle, shiftMonth } from './month-orders';

describe('isMonthKey', () => {
  it('accepts a well-formed key', () => {
    expect(isMonthKey('2026-08')).toBe(true);
    expect(isMonthKey('2026-01')).toBe(true);
    expect(isMonthKey('2026-12')).toBe(true);
  });

  it('rejects anything that would produce a nonsense date range', () => {
    // This is a request boundary — a bad key must be refused, not coerced.
    for (const bad of ['2026-13', '2026-00', '2026-8', '26-08', '2026/08', '', null, undefined, 'DROP TABLE']) {
      expect(isMonthKey(bad as string)).toBe(false);
    }
  });
});

describe('monthBounds', () => {
  it('spans the whole month, inclusive at both ends', () => {
    const { start, end } = monthBounds('2026-08');
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(7);
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(31);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
  });

  it('gets short months and leap years right', () => {
    expect(monthBounds('2026-04').end.getDate()).toBe(30);
    expect(monthBounds('2026-02').end.getDate()).toBe(28);
    expect(monthBounds('2024-02').end.getDate()).toBe(29);
  });

  it('builds LOCAL boundaries, not UTC ones', () => {
    // An order scheduled for the 31st is stored as the 30th 19:00Z under +05.
    // A UTC-built boundary would exclude it; a local one must contain it.
    const { start, end } = monthBounds('2026-08');
    expect(start.getTimezoneOffset()).toBe(new Date(2026, 7, 1).getTimezoneOffset());
    const lastEvening = new Date(2026, 7, 31, 22, 30);
    expect(lastEvening >= start && lastEvening <= end).toBe(true);
  });

  it('leaves no gap between consecutive months', () => {
    const aug = monthBounds('2026-08');
    const sep = monthBounds('2026-09');
    expect(sep.start.getTime() - aug.end.getTime()).toBe(1);
  });
});

describe('shiftMonth', () => {
  it('steps forward and back within a year', () => {
    expect(shiftMonth('2026-08', 1)).toBe('2026-09');
    expect(shiftMonth('2026-08', -1)).toBe('2026-07');
  });

  it('rolls the year over in both directions', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('handles multi-month jumps', () => {
    expect(shiftMonth('2026-08', 12)).toBe('2027-08');
    expect(shiftMonth('2026-08', -12)).toBe('2025-08');
    expect(shiftMonth('2026-08', 0)).toBe('2026-08');
  });

  it('round-trips', () => {
    expect(shiftMonth(shiftMonth('2026-01', -1), 1)).toBe('2026-01');
  });
});

describe('monthTitle', () => {
  it('renders the full Uzbek month name with the year', () => {
    expect(monthTitle('2026-08')).toBe('Август 2026');
    expect(monthTitle('2026-01')).toBe('Январ 2026');
    expect(monthTitle('2026-12')).toBe('Декабр 2026');
  });
});
