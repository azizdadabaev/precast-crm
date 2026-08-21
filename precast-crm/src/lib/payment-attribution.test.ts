import { describe, it, expect } from 'vitest';
import {
  attributionDate,
  validatePaidOn,
  MAX_BACKDATE_DAYS,
} from './payment-attribution';

const NOW = new Date(2026, 7, 21, 11, 0); // 21 August 2026

describe('attributionDate', () => {
  it('uses confirmedAt when no paid-on date was given', () => {
    // This is every one of the 306 historical payments on prod. Their
    // attribution must not change.
    const confirmedAt = new Date(2026, 7, 12);
    expect(attributionDate({ confirmedAt })).toBe(confirmedAt);
    expect(attributionDate({ paidOn: null, confirmedAt })).toBe(confirmedAt);
  });

  it('prefers paidOn when the operator recorded one', () => {
    // The reported case: cash handed over 18 July, entered 12 August.
    const paidOn = new Date(2026, 6, 18);
    const confirmedAt = new Date(2026, 7, 12);
    const d = attributionDate({ paidOn, confirmedAt });
    expect(d).toBe(paidOn);
    expect(d!.getMonth()).toBe(6); // July, not August
  });

  it('returns null when the payment is not confirmed and has no paid-on date', () => {
    // An unconfirmed payment is not revenue; it must not be forced into a month.
    expect(attributionDate({})).toBeNull();
    expect(attributionDate({ paidOn: null, confirmedAt: null })).toBeNull();
  });

  it('still attributes when paidOn is set but confirmation is pending', () => {
    const paidOn = new Date(2026, 6, 18);
    expect(attributionDate({ paidOn, confirmedAt: null })).toBe(paidOn);
  });
});

describe('validatePaidOn', () => {
  it('treats an absent value as legitimate', () => {
    for (const empty of [undefined, null, '']) {
      const r = validatePaidOn(empty, NOW);
      expect(r.ok).toBe(true);
      expect(r.value).toBeNull();
    }
  });

  it('accepts today', () => {
    const r = validatePaidOn('2026-08-21', NOW);
    expect(r.ok).toBe(true);
    expect(r.value!.getDate()).toBe(21);
  });

  it('accepts a genuine backdate within the window', () => {
    const r = validatePaidOn('2026-07-18', NOW);
    expect(r.ok).toBe(true);
    expect(r.value!.getMonth()).toBe(6);
  });

  it('rejects a future date', () => {
    // Booking cash into a month that has not happened would make a closed
    // month change later.
    expect(validatePaidOn('2026-08-22', NOW)).toMatchObject({ ok: false, reason: 'future' });
    expect(validatePaidOn('2027-01-01', NOW)).toMatchObject({ ok: false, reason: 'future' });
  });

  it('rejects a date beyond the backdating window', () => {
    // A mistyped year is far likelier than a genuinely ancient entry.
    expect(validatePaidOn('2025-08-21', NOW)).toMatchObject({ ok: false, reason: 'too-old' });
  });

  it('is exact at both edges of the window', () => {
    const lastAllowed = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - MAX_BACKDATE_DAYS);
    const oneTooFar = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - MAX_BACKDATE_DAYS - 1);
    expect(validatePaidOn(lastAllowed, NOW).ok).toBe(true);
    expect(validatePaidOn(oneTooFar, NOW)).toMatchObject({ ok: false, reason: 'too-old' });
  });

  it('refuses unparseable input rather than coercing it', () => {
    // new Date('nonsense') is an Invalid Date that poisons every comparison.
    for (const bad of ['nonsense', '2026-13-01', {}, [], true, 42]) {
      expect(validatePaidOn(bad, NOW).ok).toBe(false);
    }
  });

  it('does not trip the future check on a same-day entry made earlier in the day', () => {
    // A date-only value arrives as local midnight, before `now`.
    const earlyToday = new Date(2026, 7, 21, 23, 59);
    expect(validatePaidOn('2026-08-21', earlyToday).ok).toBe(true);
  });

  it('accepts a Date object as well as a string', () => {
    const r = validatePaidOn(new Date(2026, 6, 18), NOW);
    expect(r.ok).toBe(true);
    expect(r.value!.getMonth()).toBe(6);
  });

  it('does not mutate a Date passed in', () => {
    const input = new Date(2026, 6, 18);
    const snapshot = input.getTime();
    validatePaidOn(input, NOW);
    expect(input.getTime()).toBe(snapshot);
  });
});
