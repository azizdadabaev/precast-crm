import { describe, it, expect } from 'vitest';
import { buildRemainderContext, ledgerTotals, monthOf, sortLedger, type LedgerRow } from './ledger';

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

describe('buildRemainderContext', () => {
  // Real order 2026-07-0081: two July trucks recorded all 1 216 blocks but
  // entered "6.30": 0 on both, leaving 9 beams (56,7 m) unrecorded until the
  // order was marked delivered in August.
  const totals = { blocks: 1216, beamCount: 51, beamMeters: 257.2, area: 149.176 };
  const recorded = { blocks: 1216, beamCount: 42, beamMeters: 200.5, area: 149.176 };

  it('reports blocks complete and beams short for the real case', () => {
    const c = buildRemainderContext(totals, recorded, ['2026-07', '2026-07']);
    expect(c.blocksComplete).toBe(true);
    expect(c.beamsComplete).toBe(false);
    // This is what stops the row reading as "nothing was counted".
    expect(c.recorded.blocks).toBe(1216);
    expect(c.orderTotals.blocks).toBe(1216);
  });

  it('deduplicates and sorts the months the loads landed in', () => {
    const c = buildRemainderContext(totals, recorded, ['2026-07', '2026-06', '2026-07']);
    expect(c.recordedMonths).toEqual(['2026-06', '2026-07']);
  });

  it('rounds measurements once', () => {
    const c = buildRemainderContext(totals, recorded, ['2026-07']);
    expect(c.orderTotals.area).toBe(149.2);
    expect(c.recorded.area).toBe(149.2);
  });

  it('treats an order with nothing recorded as complete in neither', () => {
    const c = buildRemainderContext(totals, { blocks: 0, beamCount: 0, beamMeters: 0, area: 0 }, []);
    expect(c.blocksComplete).toBe(false);
    expect(c.beamsComplete).toBe(false);
    expect(c.recordedMonths).toEqual([]);
  });

  it('counts an over-loaded order as complete rather than short', () => {
    // 24 prod orders shipped more blocks than ordered.
    const c = buildRemainderContext(totals, { ...recorded, blocks: 1300, beamMeters: 300 }, ['2026-07']);
    expect(c.blocksComplete).toBe(true);
    expect(c.beamsComplete).toBe(true);
  });

  it('does not call beams short over floating-point dust', () => {
    const c = buildRemainderContext(totals, { ...recorded, beamMeters: 257.17 }, ['2026-07']);
    expect(c.beamsComplete).toBe(true);
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
