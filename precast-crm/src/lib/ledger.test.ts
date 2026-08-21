import { describe, it, expect } from 'vitest';
import { ledgerTotals, monthOf, sortLedger, type LedgerRow } from './ledger';

const row = (o: Partial<LedgerRow>): LedgerRow => ({
  id: 'r1',
  kind: 'money',
  orderId: 'o1',
  orderNumber: '2026-07-0081',
  clientName: 'Мижоз',
  orderMonth: '2026-07',
  attributedMonth: '2026-07',
  attributedAt: '2026-07-18T10:00:00.000Z',
  reason: 'x',
  crossesMonth: false,
  ...o,
});

describe('monthOf', () => {
  it('formats a local YYYY-MM', () => {
    expect(monthOf(new Date(2026, 7, 21))).toBe('2026-08');
    expect(monthOf(new Date(2026, 0, 1))).toBe('2026-01');
  });
});

describe('sortLedger', () => {
  it('puts the newest attribution first', () => {
    const out = sortLedger([
      row({ id: 'a', attributedAt: '2026-07-01T00:00:00.000Z' }),
      row({ id: 'b', attributedAt: '2026-08-12T00:00:00.000Z' }),
      row({ id: 'c', attributedAt: '2026-07-20T00:00:00.000Z' }),
    ]);
    expect(out.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('is stable for identical timestamps rather than leaving it to the database', () => {
    const same = '2026-08-12T00:00:00.000Z';
    const out = sortLedger([
      row({ id: 'x', orderNumber: '2026-08-0001', attributedAt: same }),
      row({ id: 'y', orderNumber: '2026-08-0009', attributedAt: same }),
    ]);
    expect(out.map((r) => r.id)).toEqual(['y', 'x']);
  });

  it('does not mutate its input', () => {
    const input = [row({ id: 'a', attributedAt: '2026-07-01T00:00:00.000Z' }), row({ id: 'b' })];
    const copy = input.map((r) => r.id);
    sortLedger(input);
    expect(input.map((r) => r.id)).toEqual(copy);
  });
});

describe('ledgerTotals', () => {
  it('sums money and volume into separate buckets', () => {
    const t = ledgerTotals([
      row({ kind: 'money', amount: 22_800_000 }),
      row({ kind: 'money', amount: 1_200_000 }),
      row({ kind: 'volume', blocks: 1216, beamMeters: 200.5, area: 149.176 }),
      row({ kind: 'volume', blocks: 0, beamMeters: 56.7, area: 0 }),
    ]);
    expect(t.money).toBe(24_000_000);
    expect(t.blocks).toBe(1216);
    expect(t.beamMeters).toBeCloseTo(257.2, 6);
    expect(t.area).toBeCloseTo(149.2, 6);
  });

  it('counts and values the rows that landed outside their order month', () => {
    // The reported case: July order, cash counted in August.
    const t = ledgerTotals([
      row({ kind: 'money', amount: 22_800_000, orderMonth: '2026-07', attributedMonth: '2026-08', crossesMonth: true }),
      row({ kind: 'money', amount: 5_000_000 }),
      row({ kind: 'volume', beamMeters: 56.7, orderMonth: '2026-07', attributedMonth: '2026-08', crossesMonth: true }),
    ]);
    expect(t.crossMonthCount).toBe(2);
    expect(t.crossMonthMoney).toBe(22_800_000);
    // Volume crossing a month does not inflate the money figure.
    expect(t.money).toBe(27_800_000);
  });

  it('is all zeros for an empty month', () => {
    expect(ledgerTotals([])).toEqual({
      money: 0, blocks: 0, beamMeters: 0, area: 0,
      crossMonthCount: 0, crossMonthMoney: 0,
    });
  });

  it('tolerates rows missing the fields of the other kind', () => {
    const t = ledgerTotals([row({ kind: 'money' }), row({ kind: 'volume' })]);
    expect(t.money).toBe(0);
    expect(t.blocks).toBe(0);
    expect(Number.isFinite(t.beamMeters)).toBe(true);
  });
});
