import { describe, it, expect } from 'vitest';
import {
  lengthKey, beamAreaTable, truckArea, beamsByLengthFromJson, orderBeamLines,
  loadedByLength, orderFulfilment, dayContribution, contributes, dayBuckets,
  toFulfilmentInput, type FulfilmentInput, type FulfilmentRoom,
} from './fulfilment';

// Order 2026-08-0093 — eight rooms, two trucks (prod data, 2026-10-01).
const ROOMS_0093: FulfilmentRoom[] = [
  { beamLength: 4.07, beamCount: 13, totalBlocks: 228, monolithArea: 28.816 },
  { beamLength: 4.07, beamCount: 13, totalBlocks: 228, monolithArea: 28.816 },
  { beamLength: 3.9, beamCount: 13, totalBlocks: 216, monolithArea: 27.612 },
  { beamLength: 3.9, beamCount: 8, totalBlocks: 126, monolithArea: 16.302 },
  { beamLength: 3.3, beamCount: 21, totalBlocks: 300, monolithArea: 38.676 },
  { beamLength: 3.5, beamCount: 15, totalBlocks: 224, monolithArea: 28.84 },
  { beamLength: 4.07, beamCount: 14, totalBlocks: 247, monolithArea: 31.176 },
  { beamLength: 4.3, beamCount: 22, totalBlocks: 460, monolithArea: 56.803 },
];
const TRUCK1 = { '3.30': 0, '3.50': 0, '3.90': 0, '4.07': 40, '4.30': 22 };
const TRUCK2 = { '3.30': 21, '3.50': 15, '3.90': 21, '4.07': 0, '4.30': 0 };

function order0093(over: Partial<FulfilmentInput> = {}): FulfilmentInput {
  return {
    status: 'DISPATCHED', loadedAt: null, deliveredAt: null,
    scheduledAt: new Date(2026, 7, 25),
    totalArea: 257.041, totalBlocks: 2029, totalBeams: 119,
    rooms: ROOMS_0093,
    shipments: [
      { number: 1, status: 'DELIVERED', loadedAt: new Date(2026, 7, 29, 19, 55), deliveredAt: new Date(2026, 7, 30, 8, 41), loadedBeams: TRUCK1, loadedBlocks: 980, loadedArea: null },
      { number: 2, status: 'LOADED', loadedAt: new Date(2026, 9, 1, 18, 32), deliveredAt: null, loadedBeams: TRUCK2, loadedBlocks: 1049, loadedArea: null },
    ],
    ...over,
  };
}

describe('lengthKey', () => {
  it('formats to two decimals like the load route', () => {
    expect(lengthKey(4.3)).toBe('4.30');
    expect(lengthKey('3.9')).toBe('3.90');
  });
});

describe('beamAreaTable / truckArea', () => {
  it('pools rooms sharing a beam length', () => {
    const t = beamAreaTable(ROOMS_0093);
    expect(t.get('4.07')).toEqual({ pieces: 40, area: 28.816 + 28.816 + 31.176 });
  });
  it('gives order 0093 truck 1 = 145,611 m² and truck 2 = 111,430 m²', () => {
    const t = beamAreaTable(ROOMS_0093);
    expect(truckArea(TRUCK1, t)).toBeCloseTo(145.611, 3);
    expect(truckArea(TRUCK2, t)).toBeCloseTo(111.43, 3);
  });
  it('counts a beam length that matches no room as 0 m², never NaN', () => {
    const t = beamAreaTable(ROOMS_0093);
    expect(truckArea({ '6.40': 5 }, t)).toBe(0);
    expect(truckArea(null, t)).toBe(0);
    expect(truckArea({ junk: 'x', '4.30': 11 }, t)).toBeCloseTo(56.803 / 2, 3);
  });
  it('normalises loose keys to two decimals', () => {
    expect(beamsByLengthFromJson({ '4.3': 2, '3.90': 0, bad: 3 })).toEqual({ '4.30': 2 });
  });
});

describe('orderBeamLines / loadedByLength', () => {
  it('collapses rooms to beams per length', () => {
    expect(orderBeamLines(ROOMS_0093)).toEqual({ '4.07': 40, '3.90': 21, '3.30': 21, '3.50': 15, '4.30': 22 });
  });
  it('sums only loaded trucks', () => {
    const o = order0093();
    o.shipments.push({ number: 3, status: 'PENDING', loadedAt: null, deliveredAt: null, loadedBeams: null, loadedBlocks: null, loadedArea: null });
    expect(loadedByLength(o.shipments)).toEqual({ beams: { '4.07': 40, '4.30': 22, '3.30': 21, '3.50': 15, '3.90': 21 }, blocks: 2029 });
  });
});

describe('orderFulfilment', () => {
  it('order 0093: one event per truck, nothing left to ship', () => {
    const f = orderFulfilment(order0093());
    expect(f.events.map((e) => [e.source, e.shipmentNumber])).toEqual([['shipment', 1], ['shipment', 2]]);
    expect(f.events[0].area).toBeCloseTo(145.611, 3);
    expect(f.events[0].blocks).toBe(980);
    expect(f.events[0].beamCount).toBe(62);
    expect(f.events[0].beamMeters).toBeCloseTo(257.4, 6);
    expect(f.events[1].area).toBeCloseTo(111.43, 3);
    expect(f.leftToShip.area).toBeCloseTo(0, 6);
    expect(f.leftToShip.blocks).toBe(0);
    expect(f.leftToShip.beamCount).toBe(0);
    expect(f.complete).toBe(false);
  });
  it('uses the m² saved on the truck over the computed figure', () => {
    const o = order0093();
    o.shipments[0].loadedArea = 150;
    expect(orderFulfilment(o).events[0].area).toBe(150);
  });
  it('before truck 2: left to ship is exactly truck 2', () => {
    const o = order0093();
    o.shipments[1] = { ...o.shipments[1], status: 'PENDING', loadedAt: null, loadedBeams: null, loadedBlocks: null };
    const f = orderFulfilment(o);
    expect(f.events).toHaveLength(1);
    expect(f.leftToShip.beamsByLength).toEqual({ '3.90': 21, '3.30': 21, '3.50': 15 });
    expect(f.leftToShip.blocks).toBe(1049);
    expect(f.leftToShip.area).toBeCloseTo(111.43, 3);
  });
  it('left to ship follows an edit made after truck 1', () => {
    const o = order0093();
    o.shipments[1] = { ...o.shipments[1], status: 'PENDING', loadedAt: null, loadedBeams: null, loadedBlocks: null };
    o.rooms = [...ROOMS_0093, { beamLength: 5.1, beamCount: 10, totalBlocks: 150, monolithArea: 30 }];
    o.totalArea += 30; o.totalBlocks += 150; o.totalBeams += 10;
    const f = orderFulfilment(o);
    expect(f.leftToShip.beamsByLength['5.10']).toBe(10);
    expect(f.leftToShip.blocks).toBe(1049 + 150);
    expect(f.events[0].area).toBeCloseTo(145.611, 3); // truck 1 unchanged
  });
  it('single truck: whole order on loadedAt, nothing left', () => {
    const f = orderFulfilment({ ...order0093(), status: 'LOADED', shipments: [], loadedAt: new Date(2026, 9, 2, 10) });
    expect(f.events).toHaveLength(1);
    expect(f.events[0].source).toBe('single');
    expect(f.events[0].area).toBeCloseTo(257.041, 3);
    expect(f.events[0].beamsByLength['4.07']).toBe(40);
    expect(f.leftToShip.area).toBe(0);
  });
  it('single truck on the road via legacy dispatch (no loadedAt): nothing left, no event yet', () => {
    const f = orderFulfilment({ ...order0093(), status: 'DISPATCHED', shipments: [] });
    expect(f.events).toHaveLength(0);
    expect(f.leftToShip.area).toBe(0);
  });
  it('legacy delivered order with no load record: whole order as a remainder on deliveredAt', () => {
    const f = orderFulfilment({ ...order0093(), status: 'DELIVERED', shipments: [], deliveredAt: new Date(2026, 7, 26, 12) });
    expect(f.complete).toBe(true);
    expect(f.events).toHaveLength(1);
    expect(f.events[0].source).toBe('remainder');
    expect(f.events[0].area).toBeCloseTo(257.041, 3);
    expect(f.events[0].blocks).toBe(2029);
  });
  it('unknown beam length on a truck: its area comes back through the completion remainder', () => {
    const o = order0093({ status: 'DELIVERED', deliveredAt: new Date(2026, 9, 2) });
    o.shipments[1] = { ...o.shipments[1], status: 'DELIVERED', deliveredAt: new Date(2026, 9, 2), loadedBeams: { '3.30': 21, '3.50': 15, '3.95': 21 } };
    const f = orderFulfilment(o);
    const total = f.events.reduce((s, e) => s + e.area, 0);
    expect(total).toBeCloseTo(257.041, 3);
    expect(f.events.at(-1)!.source).toBe('remainder');
  });
  it('three trucks with rounded saved m²: nothing phantom left to ship once every beam and block is loaded', () => {
    // Saved m² is rounded to 3 dp per truck; with 3+ trucks the parts can sum
    // 0.001 under the order's m². Nothing physical is left in the yard, so the
    // order must not show «Қолган» on its scheduled day.
    const o = order0093();
    o.shipments = [
      { number: 1, status: 'DELIVERED', loadedAt: new Date(2026, 7, 29), deliveredAt: new Date(2026, 7, 30), loadedBeams: { '4.07': 1 }, loadedBlocks: 10, loadedArea: 2.22 },
      { number: 2, status: 'DELIVERED', loadedAt: new Date(2026, 8, 3), deliveredAt: new Date(2026, 8, 4), loadedBeams: { '4.07': 2 }, loadedBlocks: 20, loadedArea: 4.44 },
      { number: 3, status: 'LOADED', loadedAt: new Date(2026, 9, 1), deliveredAt: null, loadedBeams: { '4.07': 37, '3.90': 21, '3.30': 21, '3.50': 15, '4.30': 22 }, loadedBlocks: 1999, loadedArea: 250.38 },
    ];
    const f = orderFulfilment(o);
    expect(f.leftToShip.blocks).toBe(0);
    expect(f.leftToShip.beamCount).toBe(0);
    expect(contributes(f.leftToShip)).toBe(false);
    expect(contributes(dayContribution(f, '2026-08-25'))).toBe(false);
  });
  it('a canceled order contributes nothing', () => {
    const f = orderFulfilment(order0093({ status: 'CANCELED' }));
    expect(f.events).toHaveLength(0);
    expect(contributes(f.leftToShip)).toBe(false);
  });
});

describe('dayContribution / dayBuckets', () => {
  it('truck days carry their truck; the scheduled day carries what is left', () => {
    const o = order0093();
    o.shipments[1] = { ...o.shipments[1], status: 'PENDING', loadedAt: null, loadedBeams: null, loadedBlocks: null };
    o.scheduledAt = new Date(2026, 9, 8);
    const f = orderFulfilment(o);
    const aug29 = dayContribution(f, '2026-08-29');
    expect(aug29.trucks).toEqual([1]);
    expect(aug29.area).toBeCloseTo(145.611, 3);
    const oct8 = dayContribution(f, '2026-10-08');
    expect(oct8.leftToShip).toBe(true);
    expect(oct8.scheduledHere).toBe(true);
    expect(oct8.area).toBeCloseTo(111.43, 3);
    expect(contributes(dayContribution(f, '2026-08-25'))).toBe(false);
  });
  it('scheduled day of a fully shipped order: listed (scheduledHere) but contributes nothing', () => {
    const f = orderFulfilment(order0093());
    const c = dayContribution(f, '2026-08-25');
    expect(c.scheduledHere).toBe(true);
    expect(contributes(c)).toBe(false);
  });
  it('dayBuckets sums orders per local day and counts each order once per day', () => {
    const a = orderFulfilment(order0093());
    const b = orderFulfilment({ ...order0093(), status: 'LOADED', shipments: [], loadedAt: new Date(2026, 9, 1, 9) });
    const m = dayBuckets([{ id: 'a', f: a }, { id: 'b', f: b }]);
    const oct1 = m.get('2026-10-01')!;
    expect(oct1.orderIds.size).toBe(2);
    expect(oct1.area).toBeCloseTo(111.43 + 257.041, 3);
    expect(m.get('2026-08-29')!.blocks).toBe(980);
  });
});

describe('toFulfilmentInput', () => {
  it('accepts API JSON (strings) and Prisma-like decimals', () => {
    const input = toFulfilmentInput({
      status: 'PLACED', loadedAt: null, deliveredAt: null, scheduledAt: '2026-10-07T19:00:00.000Z',
      totalArea: '22.272', totalBlocks: 100, totalBeams: 8,
      project: { calculations: [{ beamLength: '4.30', beamCount: 8, totalBlocks: 100, monolithArea: { toString: () => '22.272' } }] },
      shipments: [{ number: 1, status: 'LOADED', loadedAt: '2026-10-06T10:00:00.000Z', deliveredAt: null, loadedBeams: { '4.30': 8 }, loadedBlocks: 100, loadedArea: '22.272' }],
    });
    expect(input.totalArea).toBeCloseTo(22.272, 6);
    expect(input.rooms[0]).toEqual({ beamLength: 4.3, beamCount: 8, totalBlocks: 100, monolithArea: 22.272 });
    expect(input.shipments[0].loadedAt).toBeInstanceOf(Date);
    expect(input.shipments[0].loadedArea).toBeCloseTo(22.272, 6);
  });
});
