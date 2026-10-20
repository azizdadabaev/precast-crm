import { describe, it, expect } from 'vitest';
import { refundDue, owesRefund, becameOwed, refundProblem, OVERPAY_ALERT_MIN } from './overpayment';
import { RefundSchema } from './validation';

const o = (status: string, totalPrice: number, confirmedPaid: number, writeOffAmount = 0) =>
  ({ status, totalPrice, confirmedPaid, writeOffAmount });

describe('refundDue', () => {
  it('order 2026-08-0024: paid 10 001 000 for 9 094 400 → 906 600 to give back', () => {
    expect(refundDue(o('PLACED', 9_094_400, 10_001_000))).toBe(906_600);
  });
  it('nothing due while the client still owes, or paid exactly', () => {
    expect(refundDue(o('PLACED', 9_094_400, 5_000_000))).toBe(0);
    expect(refundDue(o('DELIVERED', 9_094_400, 9_094_400))).toBe(0);
  });
  it('a write-off lowers what the client owes, so paying the full price after it is an overpayment', () => {
    expect(refundDue(o('DELIVERED', 1_000_000, 1_000_000, 100_000))).toBe(100_000);
  });
  it('a canceled order owes back everything still confirmed', () => {
    expect(refundDue(o('CANCELED', 23_570_720, 21_500_000))).toBe(21_500_000);
  });
  it('accepts Prisma decimals and API strings', () => {
    expect(refundDue({ status: 'PLACED', totalPrice: '9094400', confirmedPaid: { toString: () => '10001000' }, writeOffAmount: '0' })).toBe(906_600);
  });
  it('keeps tiyin precision out of the way (11 099 951,28 paid 11 100 000)', () => {
    expect(refundDue(o('DELIVERED', 11_099_951.28, 11_100_000))).toBeCloseTo(48.72, 2);
  });
});

describe('owesRefund', () => {
  it('rounding-sized overpayments stay quiet; 1 000 UZS and up is real', () => {
    expect(owesRefund(o('DELIVERED', 4_499_950, 4_500_000))).toBe(false);
    expect(owesRefund(o('DELIVERED', 1_000_000, 1_000_000 + OVERPAY_ALERT_MIN))).toBe(true);
  });
});

describe('refundProblem', () => {
  it('allows giving back up to what is due, in parts too', () => {
    expect(refundProblem(906_600, 906_600)).toBeNull();
    expect(refundProblem(906_600, 500_000)).toBeNull();
    expect(refundProblem(48.72, 48.72)).toBeNull();
  });
  it('refuses more than is due, and refuses when nothing is due', () => {
    expect(refundProblem(906_600, 906_601)).toContain('906');
    expect(refundProblem(0, 1_000)).not.toBeNull();
  });
});

describe('RefundSchema', () => {
  it('needs a positive amount, a method and a reason', () => {
    expect(RefundSchema.safeParse({ amount: 906600, method: 'CASH', note: 'накд қайтарилди' }).success).toBe(true);
    expect(RefundSchema.safeParse({ amount: 0, method: 'CASH', note: 'накд қайтарилди' }).success).toBe(false);
    expect(RefundSchema.safeParse({ amount: -5, method: 'CASH', note: 'накд қайтарилди' }).success).toBe(false);
    expect(RefundSchema.safeParse({ amount: 100, method: 'CASH', note: 'ok' }).success).toBe(false);
  });
});

describe('becameOwed', () => {
  it('fires when an order crosses into owing a refund, or the amount grows', () => {
    expect(becameOwed(0, 906_600)).toBe(true);
    expect(becameOwed(500, 906_600)).toBe(true);
    expect(becameOwed(100_000, 906_600)).toBe(true);
  });
  it('stays quiet when nothing changed, it shrank, or it is below the threshold', () => {
    expect(becameOwed(906_600, 906_600)).toBe(false);
    expect(becameOwed(906_600, 100_000)).toBe(false);
    expect(becameOwed(0, 50)).toBe(false);
  });
});
