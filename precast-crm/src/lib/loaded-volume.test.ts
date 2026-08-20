import { describe, it, expect } from 'vitest';
import {
  accumulateLoaded,
  areaShares,
  beamsFromLoadedJson,
  loadMonthKey,
  remainderAfterRecorded,
  hasRemainder,
  roomBeamMeters,
  type LoadEvent,
} from './loaded-volume';

describe('beamsFromLoadedJson', () => {
  it('turns the length→count map into pieces and metres', () => {
    // A real prod row: 20 beams of 3.35 m, 10 of 3.65, 10 of 3.70, 28 of 3.90.
    const r = beamsFromLoadedJson({ '3.35': 20, '3.65': 10, '3.70': 10, '3.90': 28 });
    expect(r.count).toBe(68);
    expect(r.meters).toBeCloseTo(20 * 3.35 + 10 * 3.65 + 10 * 3.7 + 28 * 3.9, 6);
  });

  it('ignores lengths the operator listed but loaded none of', () => {
    // Prod rows really do contain zero counts, e.g. {"3.90":0,"4.40":7,"6.40":0}.
    const r = beamsFromLoadedJson({ '3.90': 0, '4.40': 7, '6.40': 0 });
    expect(r.count).toBe(7);
    expect(r.meters).toBeCloseTo(30.8, 6);
  });

  it('is not fooled by a single-length load', () => {
    const r = beamsFromLoadedJson({ '5.25': 26 });
    expect(r.count).toBe(26);
    expect(r.meters).toBeCloseTo(136.5, 6);
  });

  it('never returns NaN for malformed or missing JSON', () => {
    // One bad key must not poison a whole month's total.
    for (const bad of [null, undefined, [], 'x', 42, { abc: 5 }, { '3.3': 'many' }]) {
      const r = beamsFromLoadedJson(bad);
      expect(Number.isFinite(r.count)).toBe(true);
      expect(Number.isFinite(r.meters)).toBe(true);
    }
    expect(beamsFromLoadedJson({ abc: 5 })).toEqual({ count: 0, meters: 0 });
    expect(beamsFromLoadedJson({ '3.3': 'many' })).toEqual({ count: 0, meters: 0 });
  });

  it('keeps a valid entry even when a sibling entry is junk', () => {
    const r = beamsFromLoadedJson({ '4.00': 10, oops: 3 });
    expect(r.count).toBe(10);
    expect(r.meters).toBeCloseTo(40, 6);
  });
});

describe('roomBeamMeters', () => {
  it('is Σ(beamCount × beamLength) across rooms — the owner formula', () => {
    const rooms = [
      { beamCount: 12, beamLength: 4.3 },
      { beamCount: 7, beamLength: 5.25 },
      { beamCount: 3, beamLength: 3.35 },
    ];
    expect(roomBeamMeters(rooms)).toBeCloseTo(12 * 4.3 + 7 * 5.25 + 3 * 3.35, 6);
  });

  it('is zero for an order with no rooms', () => {
    expect(roomBeamMeters([])).toBe(0);
  });

  it('does not collapse different lengths into a piece count', () => {
    // 10 short beams and 10 long beams are the same COUNT but not the same METRES.
    const short = roomBeamMeters([{ beamCount: 10, beamLength: 3.3 }]);
    const long = roomBeamMeters([{ beamCount: 10, beamLength: 6.4 }]);
    expect(short).not.toBeCloseTo(long, 6);
  });
});

describe('areaShares', () => {
  it('gives a single truck the whole order area', () => {
    expect(areaShares(84.2, [{ blocks: 650, meters: 136.5 }])).toEqual([84.2]);
  });

  it('splits by block share and adds back to exactly the order area', () => {
    const shares = areaShares(100, [
      { blocks: 300, meters: 50 },
      { blocks: 100, meters: 20 },
    ]);
    expect(shares[0]).toBeCloseTo(75, 6);
    expect(shares[1]).toBeCloseTo(25, 6);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
  });

  it('falls back to beam metres for a beams-only load', () => {
    const shares = areaShares(60, [
      { blocks: 0, meters: 30 },
      { blocks: 0, meters: 10 },
    ]);
    expect(shares[0]).toBeCloseTo(45, 6);
    expect(shares[1]).toBeCloseTo(15, 6);
  });

  it('splits evenly rather than losing the area when nothing was recorded', () => {
    const shares = areaShares(50, [
      { blocks: 0, meters: 0 },
      { blocks: 0, meters: 0 },
    ]);
    expect(shares).toEqual([25, 25]);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(50, 6);
  });

  it('conserves area across many trucks with awkward ratios', () => {
    const loaded = [
      { blocks: 7, meters: 3 },
      { blocks: 11, meters: 5 },
      { blocks: 13, meters: 2 },
    ];
    const shares = areaShares(97.31, loaded);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(97.31, 6);
  });

  it('returns nothing when no truck was loaded', () => {
    expect(areaShares(100, [])).toEqual([]);
  });
});

describe('loadMonthKey', () => {
  it('buckets on local time, not UTC', () => {
    // 2026-08-31T21:00Z is 2026-09-01 02:00 in Tashkent (+05): September.
    const d = new Date('2026-08-31T21:00:00Z');
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    expect(loadMonthKey(d)).toBe(local);
  });

  it('zero-pads the month', () => {
    expect(loadMonthKey(new Date(2026, 0, 15))).toBe('2026-01');
    expect(loadMonthKey(new Date(2026, 11, 15))).toBe('2026-12');
  });
});

describe('remainderAfterRecorded', () => {
  const order = { blocks: 1000, beamCount: 40, beamMeters: 160, area: 100 };

  it('credits the whole order when nothing was ever recorded', () => {
    // 56 delivered orders on prod carry no loading record at all.
    const r = remainderAfterRecorded(order, { blocks: 0, beamCount: 0, beamMeters: 0, area: 0 });
    expect(r).toEqual(order);
    expect(hasRemainder(r)).toBe(true);
  });

  it('credits only the unrecorded balance when the first truck was logged', () => {
    // Operator photographed truck 1 and forgot the rest.
    const r = remainderAfterRecorded(order, {
      blocks: 300,
      beamCount: 12,
      beamMeters: 48,
      area: 100,
    });
    expect(r.blocks).toBe(700);
    expect(r.beamCount).toBe(28);
    expect(r.beamMeters).toBeCloseTo(112, 6);
    // Area was already fully apportioned across the logged truck, so nothing is owed.
    expect(r.area).toBeCloseTo(0, 6);
  });

  it('adds nothing when the paperwork is already complete', () => {
    const r = remainderAfterRecorded(order, order);
    expect(hasRemainder(r)).toBe(false);
  });

  it('never claws back a deliberately over-loaded order', () => {
    // 24 prod orders shipped MORE blocks than ordered. That is real product
    // on a real truck and must not be subtracted away.
    const r = remainderAfterRecorded(order, {
      blocks: 1200,
      beamCount: 50,
      beamMeters: 200,
      area: 100,
    });
    expect(r.blocks).toBe(0);
    expect(r.beamCount).toBe(0);
    expect(r.beamMeters).toBe(0);
    expect(hasRemainder(r)).toBe(false);
  });

  it('handles blocks logged but beams forgotten, and vice versa', () => {
    const blocksOnly = remainderAfterRecorded(order, {
      blocks: 1000,
      beamCount: 0,
      beamMeters: 0,
      area: 100,
    });
    expect(blocksOnly.blocks).toBe(0);
    expect(blocksOnly.beamMeters).toBeCloseTo(160, 6);

    const beamsOnly = remainderAfterRecorded(order, {
      blocks: 0,
      beamCount: 40,
      beamMeters: 160,
      area: 100,
    });
    expect(beamsOnly.blocks).toBe(1000);
    expect(beamsOnly.beamMeters).toBe(0);
  });

  it('ignores floating-point dust rather than reporting a phantom remainder', () => {
    const r = remainderAfterRecorded(order, { ...order, beamMeters: 160 - 0.00001 });
    expect(hasRemainder(r)).toBe(false);
  });
});

describe('accumulateLoaded', () => {
  const ev = (o: Partial<LoadEvent>): LoadEvent => ({
    monthKey: '2026-08',
    orderId: 'o1',
    blocks: 0,
    beamCount: 0,
    beamMeters: 0,
    area: 0,
    ...o,
  });

  it('sums every quantity into its month', () => {
    const m = accumulateLoaded([
      ev({ orderId: 'a', blocks: 650, beamCount: 26, beamMeters: 136.5, area: 84.2 }),
      ev({ orderId: 'b', blocks: 150, beamCount: 7, beamMeters: 30.8, area: 19.4 }),
    ]);
    const aug = m.get('2026-08')!;
    expect(aug.blocks).toBe(800);
    expect(aug.beamCount).toBe(33);
    expect(aug.beamMeters).toBeCloseTo(167.3, 6);
    expect(aug.area).toBeCloseTo(103.6, 6);
    expect(aug.orderCount).toBe(2);
  });

  it('counts an order once even when three trucks carried it', () => {
    const m = accumulateLoaded([
      ev({ orderId: 'same', blocks: 100 }),
      ev({ orderId: 'same', blocks: 100 }),
      ev({ orderId: 'same', blocks: 100 }),
    ]);
    const aug = m.get('2026-08')!;
    expect(aug.blocks).toBe(300);
    expect(aug.orderCount).toBe(1);
  });

  it('counts an order in both months when its trucks straddle the boundary', () => {
    // 5 orders on prod load across two months; each month genuinely got volume.
    const m = accumulateLoaded([
      ev({ orderId: 'x', monthKey: '2026-07', blocks: 40, area: 10 }),
      ev({ orderId: 'x', monthKey: '2026-08', blocks: 60, area: 15 }),
    ]);
    expect(m.get('2026-07')!.orderCount).toBe(1);
    expect(m.get('2026-08')!.orderCount).toBe(1);
    expect(m.get('2026-07')!.blocks).toBe(40);
    expect(m.get('2026-08')!.blocks).toBe(60);
    // No area is duplicated: the shares were split before bucketing.
    expect(m.get('2026-07')!.area + m.get('2026-08')!.area).toBeCloseTo(25, 6);
  });

  it('keeps months independent', () => {
    const m = accumulateLoaded([
      ev({ orderId: 'a', monthKey: '2026-07', blocks: 10 }),
      ev({ orderId: 'b', monthKey: '2026-08', blocks: 20 }),
    ]);
    expect(m.get('2026-07')!.blocks).toBe(10);
    expect(m.get('2026-08')!.blocks).toBe(20);
    expect(m.has('2026-09')).toBe(false);
  });

  it('returns an empty map for no events', () => {
    expect(accumulateLoaded([]).size).toBe(0);
  });

  it('end to end: one split order plus one single-truck order', () => {
    // Order A: 2 trucks, 300 + 100 blocks, area 100 apportioned 75/25.
    const shares = areaShares(100, [
      { blocks: 300, meters: 60 },
      { blocks: 100, meters: 20 },
    ]);
    const m = accumulateLoaded([
      ev({ orderId: 'A', blocks: 300, beamCount: 12, beamMeters: 60, area: shares[0] }),
      ev({ orderId: 'A', blocks: 100, beamCount: 4, beamMeters: 20, area: shares[1] }),
      ev({ orderId: 'B', blocks: 500, beamCount: 20, beamMeters: 90, area: 55 }),
    ]);
    const aug = m.get('2026-08')!;
    expect(aug.orderCount).toBe(2);
    expect(aug.blocks).toBe(900);
    expect(aug.beamMeters).toBeCloseTo(170, 6);
    // A contributes exactly its own 100 m², never more.
    expect(aug.area).toBeCloseTo(155, 6);
  });
});
