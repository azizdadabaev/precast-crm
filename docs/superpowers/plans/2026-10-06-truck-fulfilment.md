# Truck Fulfilment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-truck m² from beams, stock written off per truck, a real-data calendar, owner-only editing of partly shipped orders, and a date-only reschedule button.

**Architecture:** One pure, browser-safe module (`src/lib/fulfilment.ts`) turns an order + its trucks into dated load events and a "left to ship" remainder. The dashboard, ledger, calendar, day list, edit guard and reschedule preview all read it. Stock moves in the same DB transaction as the loading/delivery/cancel that causes it.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Prisma 5 / PostgreSQL, vitest, TanStack Query, Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-06-truck-fulfilment-design.md`

## Global Constraints

- Worktree `C:\Users\aziz\Downloads\precast-crm\precast-crm\.claude\worktrees\fulfilment`, branch `feat/truck-fulfilment`; app root `precast-crm/`. Local DB `precast_crm_fulfil` only — never `precast_crm` (owner's X-Ray data) and never prod.
- UI text Uzbek Cyrillic; numbers: space thousands, decimal comma, mono + tabular-nums.
- No money value per truck. Money cards, receivables, order balance unchanged.
- Schema changes additive only: `Shipment.loadedArea Decimal? @db.Decimal(10,3)`, `StockMovement.shipmentId String?` (+ relation SetNull, + index).
- Beam-length keys: `Number(len).toFixed(2)` everywhere (matches the load route and `canonicalBeamLength`).
- Day/month bucketing uses the server LOCAL calendar (`dayKey` / `loadMonthKey`), never UTC.
- No new dependencies. Never import from `tests/` outside `tests/`.
- Every DB write that moves stock runs inside the same `prisma.$transaction` as the status change.

## Review Focus

1. Order edited (by the owner) after truck 1 loaded, adding a new beam length → left-to-ship and the next truck's form include the new length; truck 1's saved m² does not change. (Task 1 test "left to ship follows an edit", Task 5 floor test.)
2. Truck carried a beam length that matches no room (legacy row) → 0 m² for that truck, never NaN; the order's m² is recovered by the completion remainder. (Task 1 test.)
3. Order delivered whose stock was already partly written off by trucks → «Етказилган» writes off only the difference; a second delivery call cannot write twice. (Task 4 tests on `remainingToWriteOff`.)
4. Cancel of an order delivered before the stock book existed (no movements) → restocks nothing instead of inventing stock. (Task 4 test on `netWrittenOff`.)
5. Day list for a day where an order is scheduled but fully shipped on an earlier day → still listed, tagged «Бошқа куни жўнатилган», contributing 0 to the cell. (Task 1 `dayContribution` test + Task 3 UI.)

---

## File Structure

| File | Responsibility |
|---|---|
| `precast-crm/src/lib/fulfilment.ts` (new) | Pure engine: area table, truck m², events, left to ship, day contribution, day buckets, input mapper. |
| `precast-crm/src/lib/fulfilment.test.ts` (new) | Unit tests incl. order 2026-08-0093 golden numbers. |
| `precast-crm/src/lib/fulfilment-data.ts` (new) | Server-only: Prisma `select` + day-window candidate `where`. |
| `precast-crm/src/lib/loaded-volume.ts` / `.test.ts` | Delete `areaShares` + its tests (replaced). |
| `precast-crm/src/lib/dashboard-data.ts` | Loaded volume, today, week from the engine. |
| `precast-crm/src/app/api/ledger/route.ts` | Volume rows from the engine. |
| `precast-crm/src/app/api/orders/capacity/route.ts` | Day buckets from the engine. |
| `precast-crm/src/app/api/orders/route.ts` | `day` filter = contributing orders; additive `dayActivity`. |
| `precast-crm/src/app/(app)/orders/page.tsx` | Day tag per row. |
| `precast-crm/src/lib/openapi/registry.ts`, `docs/api/openapi.json` | Document `dayActivity`. |
| `precast-crm/prisma/schema.prisma` | Two additive columns. |
| `precast-crm/src/lib/inventory.ts` / `tests/inventory.test.ts` | Shipment lines, net written off, remaining to write off, shipment-aware movements, warnings helper. |
| `precast-crm/src/app/api/orders/[id]/shipments/[sid]/load/route.ts` | Save `loadedArea`; write off truck stock. |
| `precast-crm/src/lib/order-load.ts` | Single-truck write-off (CRM + Telegram bot). |
| `precast-crm/src/app/api/orders/[id]/delivery-proof/route.ts`, `.../[id]/route.ts` | Remainder write-off on DELIVERED; reschedule guard. |
| `precast-crm/src/app/api/orders/[id]/cancel/route.ts` | Restock net written off. |
| `precast-crm/src/lib/permissions.ts` | `order.editShipped`. |
| `precast-crm/src/lib/order-edit-policy.ts` / `.test.ts` (new) | `editPolicy`, `loadedFloorViolations`, Uzbek messages. |
| `precast-crm/src/app/api/orders/[id]/edit/route.ts` | Policy + floor guard. |
| `precast-crm/src/components/orders/RescheduleDialog.tsx` (new) | Calendar → confirm → PATCH date. |
| `precast-crm/src/app/(app)/orders/[id]/page.tsx` | Edit button follows policy; reschedule button. |
| `precast-crm/scripts/backfill-truck-fulfilment.ts` (new) | One-time dry-run/apply backfill. |
| `precast-crm/scripts/smoke-truck-fulfilment.ts` (new) | Local end-to-end smoke over HTTP. |

---

### Task 1: Fulfilment engine (pure)

**Files:**
- Create: `precast-crm/src/lib/fulfilment.ts`
- Test: `precast-crm/src/lib/fulfilment.test.ts`

**Interfaces:**
- Consumes: `beamsFromLoadedJson`, `physicalCompletion`, `remainderAfterRecorded`, `hasRemainder` from `@/lib/loaded-volume`; `dayKey` from `@/lib/dashboard-metrics`.
- Produces (exact):
  - `lengthKey(n: number | string): string`
  - `type Quantities = { blocks: number; beamCount: number; beamMeters: number; area: number }`
  - `interface FulfilmentRoom { beamLength: number; beamCount: number; totalBlocks: number; monolithArea: number }`
  - `interface FulfilmentShipment { number: number; status: string; loadedAt: Date | null; deliveredAt: Date | null; loadedBeams: unknown; loadedBlocks: number | null; loadedArea: number | null }`
  - `interface FulfilmentInput { status: string; loadedAt: Date | null; deliveredAt: Date | null; scheduledAt: Date; totalArea: number; totalBlocks: number; totalBeams: number; rooms: FulfilmentRoom[]; shipments: FulfilmentShipment[] }`
  - `type FulfilmentSource = 'shipment' | 'single' | 'remainder'`
  - `interface FulfilmentEvent extends Quantities { at: Date; source: FulfilmentSource; shipmentNumber: number | null; beamsByLength: Record<string, number> }`
  - `interface LeftToShip extends Quantities { beamsByLength: Record<string, number> }`
  - `interface OrderFulfilment { totals: Quantities; events: FulfilmentEvent[]; leftToShip: LeftToShip; complete: boolean; scheduledAt: Date }`
  - `beamAreaTable(rooms): Map<string, { pieces: number; area: number }>`
  - `beamsByLengthFromJson(json: unknown): Record<string, number>`
  - `truckArea(loadedBeams: unknown, table): number`
  - `orderBeamLines(rooms): Record<string, number>`
  - `loadedByLength(shipments): { beams: Record<string, number>; blocks: number }`
  - `orderFulfilment(input: FulfilmentInput): OrderFulfilment`
  - `interface DayContribution extends Quantities { trucks: number[]; single: boolean; remainder: boolean; leftToShip: boolean; scheduledHere: boolean }`
  - `dayContribution(f: OrderFulfilment, day: string): DayContribution`
  - `contributes(q: Quantities): boolean`
  - `dayBuckets(items: Array<{ id: string; f: OrderFulfilment }>): Map<string, { area: number; blocks: number; beamCount: number; orderIds: Set<string> }>`
  - `toFulfilmentInput(raw: RawFulfilmentOrder): FulfilmentInput` where `RawFulfilmentOrder` accepts Prisma rows (Decimal) and API JSON (strings).

- [ ] **Step 1: Write the failing tests** — `precast-crm/src/lib/fulfilment.test.ts`

```ts
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
const d = (s: string) => new Date(s);

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
```

- [ ] **Step 2: Run to verify failure**

Run (from `precast-crm/`): `npx vitest run src/lib/fulfilment.test.ts`
Expected: FAIL — `Failed to resolve import "./fulfilment"`.

- [ ] **Step 3: Implement** — `precast-crm/src/lib/fulfilment.ts`

```ts
// Truck fulfilment — what each truck carried, when, and what is still left.
//
// Pure and browser-safe (no Prisma import): the server uses it for the
// dashboard, ledger, calendar and the edit guard; the order page runs the
// same code to preview a reschedule. One engine, so those surfaces cannot
// disagree.
//
// Owner rules (2026-10-06, spec docs/superpowers/specs/2026-10-06-truck-fulfilment-design.md):
//  - a truck is about GOODS only: exact beams per length and blocks;
//  - a truck's m² comes from ITS BEAMS — m² is billed on beams × pitch, so the
//    rooms a beam length belongs to are the m² that beam carries. Blocks are
//    filler and go on whichever truck has room, so they cannot decide m²;
//  - the date of a truck's goods is its loading day.

import {
  beamsFromLoadedJson,
  hasRemainder,
  physicalCompletion,
  remainderAfterRecorded,
} from '@/lib/loaded-volume';
import { dayKey } from '@/lib/dashboard-metrics';

export type Quantities = { blocks: number; beamCount: number; beamMeters: number; area: number };

export interface FulfilmentRoom {
  beamLength: number;
  beamCount: number;
  totalBlocks: number;
  monolithArea: number;
}

export interface FulfilmentShipment {
  number: number;
  status: string;
  loadedAt: Date | null;
  deliveredAt: Date | null;
  loadedBeams: unknown;
  loadedBlocks: number | null;
  /** m² saved on the truck at loading; null on trucks loaded before it existed. */
  loadedArea: number | null;
}

export interface FulfilmentInput {
  status: string;
  loadedAt: Date | null;
  deliveredAt: Date | null;
  scheduledAt: Date;
  totalArea: number;
  totalBlocks: number;
  totalBeams: number;
  rooms: FulfilmentRoom[];
  shipments: FulfilmentShipment[];
}

export type FulfilmentSource = 'shipment' | 'single' | 'remainder';

export interface FulfilmentEvent extends Quantities {
  at: Date;
  source: FulfilmentSource;
  shipmentNumber: number | null;
  beamsByLength: Record<string, number>;
}

export interface LeftToShip extends Quantities {
  beamsByLength: Record<string, number>;
}

export interface OrderFulfilment {
  totals: Quantities;
  events: FulfilmentEvent[];
  leftToShip: LeftToShip;
  /** Goods physically complete (see `physicalCompletion`). */
  complete: boolean;
  scheduledAt: Date;
}

const EMPTY: Quantities = { blocks: 0, beamCount: 0, beamMeters: 0, area: 0 };

/** Beam-length key, two decimals — the form the loading form writes. */
export function lengthKey(n: number | string): string {
  return Number(n).toFixed(2);
}

/** Pieces and m² per beam length, pooled across rooms that share the length. */
export function beamAreaTable(rooms: FulfilmentRoom[]): Map<string, { pieces: number; area: number }> {
  const t = new Map<string, { pieces: number; area: number }>();
  for (const r of rooms) {
    if (!(r.beamCount > 0) || !(r.beamLength > 0)) continue;
    const k = lengthKey(r.beamLength);
    const cur = t.get(k) ?? { pieces: 0, area: 0 };
    cur.pieces += r.beamCount;
    cur.area += r.monolithArea;
    t.set(k, cur);
  }
  return t;
}

/** A truck's `loadedBeams` JSON as clean `{ "4.30": 22 }`, zero/junk entries dropped. */
export function beamsByLengthFromJson(json: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!json || typeof json !== 'object' || Array.isArray(json)) return out;
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    const len = Number(k);
    const n = Number(v);
    if (!Number.isFinite(len) || !Number.isFinite(n) || len <= 0 || n <= 0) continue;
    const key = lengthKey(len);
    out[key] = (out[key] ?? 0) + n;
  }
  return out;
}

/**
 * m² a truck carried: for each length, pieces × (that length's m² ÷ its pieces).
 * A length matching no room adds 0 here; the order's completion remainder
 * recognises that area instead, so it is never lost and never NaN.
 */
export function truckArea(loadedBeams: unknown, table: Map<string, { pieces: number; area: number }>): number {
  let area = 0;
  for (const [k, n] of Object.entries(beamsByLengthFromJson(loadedBeams))) {
    const row = table.get(k);
    if (row && row.pieces > 0) area += (n * row.area) / row.pieces;
  }
  return area;
}

/** The order's beams per length, from its current rooms. */
export function orderBeamLines(rooms: FulfilmentRoom[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rooms) {
    if (!(r.beamCount > 0) || !(r.beamLength > 0)) continue;
    const k = lengthKey(r.beamLength);
    out[k] = (out[k] ?? 0) + r.beamCount;
  }
  return out;
}

/** Everything already loaded onto trucks: beams per length + blocks. */
export function loadedByLength(shipments: FulfilmentShipment[]): { beams: Record<string, number>; blocks: number } {
  const beams: Record<string, number> = {};
  let blocks = 0;
  for (const s of shipments) {
    if (!s.loadedAt) continue;
    for (const [k, n] of Object.entries(beamsByLengthFromJson(s.loadedBeams))) beams[k] = (beams[k] ?? 0) + n;
    blocks += Number(s.loadedBlocks ?? 0);
  }
  return { beams, blocks };
}

function metresOf(beams: Record<string, number>): number {
  return Object.entries(beams).reduce((s, [k, n]) => s + Number(k) * n, 0);
}
function piecesOf(beams: Record<string, number>): number {
  return Object.values(beams).reduce((s, n) => s + n, 0);
}

export function orderFulfilment(o: FulfilmentInput): OrderFulfilment {
  const lines = orderBeamLines(o.rooms);
  const totals: Quantities = {
    blocks: o.totalBlocks,
    beamCount: o.totalBeams,
    beamMeters: metresOf(lines),
    area: o.totalArea,
  };
  const none: LeftToShip = { ...EMPTY, beamsByLength: {} };
  // Canceled orders are outside every figure (LIVE_ORDERS), here too.
  if (o.status === 'CANCELED') return { totals, events: [], leftToShip: none, complete: false, scheduledAt: o.scheduledAt };

  const table = beamAreaTable(o.rooms);
  const events: FulfilmentEvent[] = [];
  const loaded = o.shipments.filter((s) => s.loadedAt);

  if (loaded.length > 0) {
    for (const s of loaded) {
      const beams = beamsByLengthFromJson(s.loadedBeams);
      const parsed = beamsFromLoadedJson(s.loadedBeams);
      events.push({
        at: s.loadedAt as Date,
        source: 'shipment',
        shipmentNumber: s.number,
        beamsByLength: beams,
        blocks: Number(s.loadedBlocks ?? 0),
        beamCount: parsed.count,
        beamMeters: parsed.meters,
        area: s.loadedArea ?? truckArea(s.loadedBeams, table),
      });
    }
  } else if (o.loadedAt) {
    events.push({ at: o.loadedAt, source: 'single', shipmentNumber: null, beamsByLength: { ...lines }, ...totals });
  }

  const recorded = events.reduce<Quantities>(
    (s, e) => ({ blocks: s.blocks + e.blocks, beamCount: s.beamCount + e.beamCount, beamMeters: s.beamMeters + e.beamMeters, area: s.area + e.area }),
    { ...EMPTY },
  );

  const completedAt = physicalCompletion({
    status: o.status,
    deliveredAt: o.deliveredAt,
    loadedAt: o.loadedAt,
    scheduledAt: o.scheduledAt,
    shipments: o.shipments,
  });
  const already = loadedByLength(o.shipments);
  if (completedAt) {
    const rest = remainderAfterRecorded(totals, recorded);
    if (hasRemainder(rest)) {
      const restBeams: Record<string, number> = {};
      const loadedBeams = o.loadedAt && loaded.length === 0 ? lines : already.beams;
      for (const [k, n] of Object.entries(lines)) {
        const left = n - (loadedBeams[k] ?? 0);
        if (left > 0) restBeams[k] = left;
      }
      events.push({ at: completedAt, source: 'remainder', shipmentNumber: null, beamsByLength: restBeams, ...rest });
    }
  }

  const onTruckWhole = o.shipments.length === 0 && (o.loadedAt != null || o.status === 'LOADED' || o.status === 'DISPATCHED');
  let leftToShip: LeftToShip = none;
  if (!completedAt && !onTruckWhole) {
    const beams: Record<string, number> = {};
    for (const [k, n] of Object.entries(lines)) {
      const left = n - (already.beams[k] ?? 0);
      if (left > 0) beams[k] = left;
    }
    const truckM2 = events.filter((e) => e.source === 'shipment').reduce((s, e) => s + e.area, 0);
    leftToShip = {
      beamsByLength: beams,
      blocks: Math.max(0, o.totalBlocks - already.blocks),
      beamCount: piecesOf(beams),
      beamMeters: metresOf(beams),
      area: Math.max(0, o.totalArea - truckM2),
    };
  }

  return { totals, events, leftToShip, complete: completedAt != null, scheduledAt: o.scheduledAt };
}

/** True when any quantity is worth showing. */
export function contributes(q: Quantities): boolean {
  return q.blocks > 0 || q.beamCount > 0 || q.beamMeters > 0.0001 || q.area > 0.0001;
}

export interface DayContribution extends Quantities {
  /** Truck numbers loaded this day. */
  trucks: number[];
  single: boolean;
  remainder: boolean;
  /** What is still left to ship lands on this (scheduled) day. */
  leftToShip: boolean;
  /** The order's scheduled day is this day (even if it contributes nothing). */
  scheduledHere: boolean;
}

/** What one order puts on one local calendar day (`YYYY-MM-DD`). */
export function dayContribution(f: OrderFulfilment, day: string): DayContribution {
  const c: DayContribution = { ...EMPTY, trucks: [], single: false, remainder: false, leftToShip: false, scheduledHere: dayKey(f.scheduledAt) === day };
  for (const e of f.events) {
    if (dayKey(e.at) !== day) continue;
    c.blocks += e.blocks; c.beamCount += e.beamCount; c.beamMeters += e.beamMeters; c.area += e.area;
    if (e.source === 'shipment' && e.shipmentNumber != null) c.trucks.push(e.shipmentNumber);
    if (e.source === 'single') c.single = true;
    if (e.source === 'remainder') c.remainder = true;
  }
  if (c.scheduledHere && contributes(f.leftToShip)) {
    c.blocks += f.leftToShip.blocks; c.beamCount += f.leftToShip.beamCount;
    c.beamMeters += f.leftToShip.beamMeters; c.area += f.leftToShip.area;
    c.leftToShip = true;
  }
  return c;
}

/** Per local day: Σ events + left-to-ship on the scheduled day, across orders. */
export function dayBuckets(
  items: Array<{ id: string; f: OrderFulfilment }>,
): Map<string, { area: number; blocks: number; beamCount: number; orderIds: Set<string> }> {
  const m = new Map<string, { area: number; blocks: number; beamCount: number; orderIds: Set<string> }>();
  const add = (day: string, id: string, q: Quantities) => {
    if (!contributes(q)) return;
    const b = m.get(day) ?? { area: 0, blocks: 0, beamCount: 0, orderIds: new Set<string>() };
    b.area += q.area; b.blocks += q.blocks; b.beamCount += q.beamCount; b.orderIds.add(id);
    m.set(day, b);
  };
  for (const { id, f } of items) {
    for (const e of f.events) add(dayKey(e.at), id, e);
    add(dayKey(f.scheduledAt), id, f.leftToShip);
  }
  return m;
}

// ── Input mapping ─────────────────────────────────────────────────────────
// One mapper for Prisma rows (Decimal objects) and API JSON (strings), so the
// server and the order page feed the engine identically.

type NumLike = number | string | { toString(): string } | null | undefined;
type DateLike = Date | string | null | undefined;

export interface RawFulfilmentOrder {
  status: string;
  loadedAt: DateLike;
  deliveredAt: DateLike;
  scheduledAt: Date | string;
  totalArea: NumLike;
  totalBlocks: number;
  totalBeams: number;
  project: { calculations: Array<{ beamLength: NumLike; beamCount: number; totalBlocks: number; monolithArea: NumLike }> };
  shipments: Array<{
    number: number; status: string; loadedAt: DateLike; deliveredAt: DateLike;
    loadedBeams: unknown; loadedBlocks: number | null; loadedArea?: NumLike;
  }>;
}

const num = (v: NumLike): number => (v == null ? 0 : Number(typeof v === 'object' ? v.toString() : v));
const date = (v: DateLike): Date | null => (v == null ? null : v instanceof Date ? v : new Date(v));

export function toFulfilmentInput(raw: RawFulfilmentOrder): FulfilmentInput {
  return {
    status: raw.status,
    loadedAt: date(raw.loadedAt),
    deliveredAt: date(raw.deliveredAt),
    scheduledAt: date(raw.scheduledAt) as Date,
    totalArea: num(raw.totalArea),
    totalBlocks: raw.totalBlocks,
    totalBeams: raw.totalBeams,
    rooms: raw.project.calculations.map((c) => ({
      beamLength: num(c.beamLength),
      beamCount: c.beamCount,
      totalBlocks: c.totalBlocks,
      monolithArea: num(c.monolithArea),
    })),
    shipments: raw.shipments.map((s) => ({
      number: s.number,
      status: s.status,
      loadedAt: date(s.loadedAt),
      deliveredAt: date(s.deliveredAt),
      loadedBeams: s.loadedBeams,
      loadedBlocks: s.loadedBlocks,
      loadedArea: s.loadedArea == null ? null : num(s.loadedArea),
    })),
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/fulfilment.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/lib/fulfilment.ts src/lib/fulfilment.test.ts
git commit -m "Feat(fulfilment) · one engine for what each truck carried and what is left to ship"
```

---

### Task 2: Dashboard + ledger read the engine

**Files:**
- Create: `precast-crm/src/lib/fulfilment-data.ts`
- Modify: `precast-crm/src/lib/dashboard-data.ts` (todayOrders/weekOrders queries; loaded-volume block)
- Modify: `precast-crm/src/app/api/ledger/route.ts` (VOLUME section)
- Modify: `precast-crm/src/lib/loaded-volume.ts`, `precast-crm/src/lib/loaded-volume.test.ts` (delete `areaShares` + its `describe`)

**Interfaces:**
- Consumes: Task 1 exports.
- Produces: `FULFILMENT_SELECT` (Prisma `OrderSelect`), `type FulfilmentRow`, `dayWindowWhere(start: Date, endExclusive: Date): Prisma.OrderWhereInput`, `fulfilmentOf(row: FulfilmentRow): OrderFulfilment`.

- [ ] **Step 1: Create `fulfilment-data.ts`**

```ts
import type { Prisma } from '@prisma/client';
import { orderFulfilment, toFulfilmentInput, type OrderFulfilment } from '@/lib/fulfilment';

/** Every field the fulfilment engine reads. */
export const FULFILMENT_SELECT = {
  id: true,
  status: true,
  loadedAt: true,
  deliveredAt: true,
  scheduledAt: true,
  totalArea: true,
  totalBlocks: true,
  totalBeams: true,
  project: { select: { calculations: { select: { beamLength: true, beamCount: true, totalBlocks: true, monolithArea: true } } } },
  shipments: {
    orderBy: { number: 'asc' },
    select: { number: true, status: true, loadedAt: true, deliveredAt: true, loadedBeams: true, loadedBlocks: true, loadedArea: true },
  },
} satisfies Prisma.OrderSelect;

export type FulfilmentRow = Prisma.OrderGetPayload<{ select: typeof FULFILMENT_SELECT }>;

export function fulfilmentOf(row: FulfilmentRow): OrderFulfilment {
  return orderFulfilment(toFulfilmentInput(row));
}

/**
 * Orders that can put anything on a calendar day in [start, endExclusive):
 * scheduled there (left to ship), a truck loaded there, or a completion there.
 */
export function dayWindowWhere(start: Date, endExclusive: Date): Prisma.OrderWhereInput {
  const w = { gte: start, lt: endExclusive };
  return {
    OR: [
      { scheduledAt: w },
      { loadedAt: w },
      { deliveredAt: w },
      { shipments: { some: { loadedAt: w } } },
      { shipments: { some: { deliveredAt: w } } },
    ],
  };
}
```

(`loadedArea` does not exist until Task 4's schema change. Do Task 4 Step 1 — schema + `prisma db push` + `prisma generate` — **before** this step so the select type-checks. Order of execution: Task 1 → Task 4 Step 1 → Task 2 → Task 3 → rest of Task 4.)

- [ ] **Step 2: Dashboard loaded volume from the engine**

In `dashboard-data.ts`: replace the `loadableOrders` query's `select` with `{ ...FULFILMENT_SELECT }` (keep its `where`), and replace the whole `for (const o of loadableOrders) { … }` loop with:

```ts
  const loadEvents: LoadEvent[] = [];
  for (const o of loadableOrders) {
    for (const e of fulfilmentOf(o).events) {
      loadEvents.push({
        monthKey: loadMonthKey(e.at),
        orderId: o.id,
        blocks: e.blocks,
        beamCount: e.beamCount,
        beamMeters: e.beamMeters,
        area: e.area,
      });
    }
  }
```

Update the comment above it: m² per truck now comes from its beams (owner rule 2026-10-06), not block share. Remove now-unused imports (`areaShares`, `beamsFromLoadedJson`, `hasRemainder`, `physicalCompletion`, `remainderAfterRecorded`, `roomBeamMeters`) — keep `accumulateLoaded`, `loadMonthKey`, `LoadEvent`, `LoadedVolume`.

- [ ] **Step 3: Today + week from the engine**

Replace the `todayOrders` and `weekOrders` entries of the `Promise.all` with ONE query (keep the destructured name `weekOrders`, drop `todayOrders`):

```ts
    prisma.order.findMany({
      where: { AND: [LIVE_ORDERS, dayWindowWhere(weekStart, new Date(weekEnd.getTime() + 1))] },
      select: {
        ...FULFILMENT_SELECT,
        orderNumber: true,
        totalPrice: true,
        confirmedPaid: true,
        writeOffAmount: true,
        client: { select: { name: true, address: true } },
      },
    }),
```

Then replace the "Today's deliveries" and "Week capacity strip" computations:

```ts
  // ── Today + week — real data (owner 2026-10-06): goods that left each day
  // + what is still left to ship on the order's scheduled day.
  const weekFulfilment = weekOrders.map((o) => ({ o, f: fulfilmentOf(o) }));
  const todayKey = dayKey(now);
  const todayRows = weekFulfilment
    .map(({ o, f }) => ({ o, c: dayContribution(f, todayKey) }))
    .filter(({ c }) => contributes(c))
    .sort((a, b) => a.o.scheduledAt.getTime() - b.o.scheduledAt.getTime());
  const todayCount = todayRows.length;
  const todayArea = todayRows.reduce((s, r) => s + r.c.area, 0);
```

and for the week strip, replace the `for (const o of weekOrders)` accumulation with:

```ts
  const buckets = dayBuckets(weekFulfilment.map(({ o, f }) => ({ id: o.id, f })));
  for (const d of weekDays) d.bookedM2 = buckets.get(d.date)?.area ?? 0;
```

and in the payload `todayDeliveries.orders` map over `todayRows`:

```ts
      orders: todayRows.map(({ o, c }) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        clientName: o.client.name,
        // Today's portion — the truck(s) loaded today and/or what is left to ship.
        totalArea: Math.round(c.area * 10) / 10,
        status: o.status,
        clientAddress: o.client.address ?? null,
        totalPrice: Math.round(Number(o.totalPrice)),
        remaining: Math.round(remainingBalance(Number(o.totalPrice), Number(o.confirmedPaid), Number(o.writeOffAmount))),
      })),
```

Imports: `import { contributes, dayBuckets, dayContribution } from '@/lib/fulfilment';` and `import { FULFILMENT_SELECT, dayWindowWhere, fulfilmentOf } from '@/lib/fulfilment-data';`. Update the `DashboardPayload.todayDeliveries` doc comment: `totalArea` is today's portion.

- [ ] **Step 4: Ledger volume rows from the engine**

In `api/ledger/route.ts`, replace the orders query `select` with `{ ...FULFILMENT_SELECT, orderNumber: true, placedAt: true, client: { select: { name: true } } }` and the per-order loop body with:

```ts
    for (const o of orders) {
      const orderMonth = monthOf(o.placedAt);
      const f = fulfilmentOf(o);
      const recorded = { blocks: 0, beamCount: 0, beamMeters: 0, area: 0 };
      const recordedMonths: string[] = [];
      for (const e of f.events) {
        if (e.source !== 'remainder') {
          recorded.blocks += e.blocks; recorded.beamCount += e.beamCount;
          recorded.beamMeters += e.beamMeters; recorded.area += e.area;
          recordedMonths.push(monthOf(e.at));
        }
      }
      for (const e of f.events) {
        if (!inMonth(e.at)) continue;
        const attributedMonth = monthOf(e.at);
        const reason =
          e.source === 'shipment' ? LEDGER_REASONS.shipmentLoaded(e.shipmentNumber ?? 0)
          : e.source === 'single' ? LEDGER_REASONS.singleTruck
          : LEDGER_REASONS.deliveredRemainder;
        rows.push({
          id: `vol:${o.id}:${e.source === 'shipment' ? `ship${e.shipmentNumber}` : e.source}`,
          kind: 'volume',
          orderId: o.id,
          orderNumber: o.orderNumber,
          clientName: o.client.name,
          orderMonth,
          attributedMonth,
          attributedAt: e.at.toISOString(),
          reason,
          blocks: e.blocks,
          beamCount: e.beamCount,
          beamMeters: Math.round(e.beamMeters * 10) / 10,
          area: Math.round(e.area * 10) / 10,
          crossesMonth: orderMonth !== attributedMonth,
          ...(e.source === 'remainder' ? { context: buildRemainderContext(f.totals, recorded, recordedMonths) } : {}),
        });
      }
    }
```

Row ids keep the old forms (`ship<n>`, `single`, `remainder`). Remove now-unused imports from `@/lib/loaded-volume`.

- [ ] **Step 5: Delete `areaShares`**

Delete the `areaShares` function (and its doc comment) from `loaded-volume.ts`, and the `describe('areaShares', …)` block plus `areaShares` from the import list in `loaded-volume.test.ts`. Grep: `grep -rn areaShares src` → no results.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit -p .` → exit 0. `npx vitest run src/lib` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/fulfilment-data.ts src/lib/dashboard-data.ts src/app/api/ledger/route.ts src/lib/loaded-volume.ts src/lib/loaded-volume.test.ts
git commit -m "Feat(dashboard) · loaded m² per truck from its beams; today and week follow real data"
```

---

### Task 3: Calendar and day list follow real data

**Files:**
- Modify: `precast-crm/src/app/api/orders/capacity/route.ts`
- Modify: `precast-crm/src/app/api/orders/route.ts` (GET day filter)
- Modify: `precast-crm/src/app/(app)/orders/page.tsx` (Order type + row tag)
- Modify: `precast-crm/src/lib/openapi/registry.ts` (OrderListItem `dayActivity`), regenerate `docs/api/openapi.json`

**Interfaces:**
- Consumes: `FULFILMENT_SELECT`, `dayWindowWhere`, `fulfilmentOf` (Task 2); `dayBuckets`, `dayContribution`, `contributes`, `DayContribution` (Task 1).
- Produces: `GET /api/orders` items gain optional `dayActivity: { area: number; blocks: number; beamCount: number; trucks: number[]; single: boolean; remainder: boolean; leftToShip: boolean; scheduledHere: boolean }` when `day` is given.

- [ ] **Step 1: Capacity route**

Replace the query + bucketing in `capacity/route.ts` with:

```ts
  const end = new Date(to.getTime() + 1);
  const orders = await prisma.order.findMany({
    where: { AND: [{ status: { not: "CANCELED" } }, dayWindowWhere(from, end)] },
    select: FULFILMENT_SELECT,
  });
  // Real data (owner 2026-10-06): a day = goods that actually left that day
  // + what is still left to ship of orders scheduled that day. Partly shipped
  // orders therefore no longer put their WHOLE m² on the scheduled day.
  const buckets = dayBuckets(orders.map((o) => ({ id: o.id, f: fulfilmentOf(o) })));
  const fromKey = dayKey(from);
  const toKey = dayKey(to);
  const days = Array.from(buckets.entries())
    .filter(([date]) => date >= fromKey && date <= toKey)
    .map(([date, b]) => ({
      date,
      totalArea: Math.round(b.area * 100) / 100,
      totalOrders: b.orderIds.size,
      totalBlocks: b.blocks,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
```

Update the header comment (blocks/area now = loaded that day + left to ship). Imports: `dayBuckets` from `@/lib/fulfilment`, `dayKey` from `@/lib/dashboard-metrics`, `FULFILMENT_SELECT, dayWindowWhere, fulfilmentOf` from `@/lib/fulfilment-data`.

- [ ] **Step 2: Day filter = contributing orders**

In `GET /api/orders`, replace the `if (day && …) { … where.scheduledAt = … }` block. Move it **after** the `q` block (so `where.OR` already holds the search) and write:

```ts
  // Day filter (owner 2026-10-06): the orders that put something on that
  // calendar day — a truck loaded, a completion, or what is left to ship on
  // its scheduled day — plus orders scheduled that day even when they shipped
  // on another day (tagged in the UI). Resolved to an id set so counts, pages
  // and facets all describe the same rows as the calendar cell.
  const dayActivity = new Map<string, DayContribution>();
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const [y, m, d] = day.split("-").map((n) => Number(n));
    const start = new Date(y, m - 1, d, 0, 0, 0, 0);
    const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
    const candidates = await prisma.order.findMany({
      where: { AND: [dayWindowWhere(start, end), where.OR ? { OR: where.OR as Prisma.OrderWhereInput[] } : {}] },
      select: FULFILMENT_SELECT,
    });
    for (const c of candidates) {
      const act = dayContribution(fulfilmentOf(c), day);
      if (contributes(act) || act.scheduledHere) dayActivity.set(c.id, act);
    }
    where.id = { in: Array.from(dayActivity.keys()) };
  }
```

(`facetWhere` is copied from `where` after this block, so move the `const facetWhere = { ...where };` line below it.) In the response, attach the activity:

```ts
  return ok({
    items: dayActivity.size
      ? items.map((o) => {
          const a = dayActivity.get(o.id);
          return a ? { ...o, dayActivity: { ...a, area: Math.round(a.area * 100) / 100, beamMeters: Math.round(a.beamMeters * 10) / 10 } } : o;
        })
      : items,
    ...
```

Imports: `import type { Prisma } from "@prisma/client";`, `contributes, dayContribution, type DayContribution` from `@/lib/fulfilment`, `FULFILMENT_SELECT, dayWindowWhere, fulfilmentOf` from `@/lib/fulfilment-data`.

- [ ] **Step 3: Orders page tag**

In `orders/page.tsx` add to `interface Order`:

```ts
  dayActivity?: { area: number; trucks: number[]; single: boolean; remainder: boolean; leftToShip: boolean; scheduledHere: boolean };
```

In the m² cell (`<td className="px-3 py-2.5 text-right font-mono">`), under the existing figure, render when `o.dayActivity` is present:

```tsx
                        {o.dayActivity && (
                          <div className="text-[11px] font-sans font-medium text-text-tertiary whitespace-nowrap mt-0.5">
                            {dayTag(o.dayActivity)}
                          </div>
                        )}
```

with the helper (top level of the file):

```ts
/** What this order put on the picked calendar day, in one short line. */
function dayTag(a: NonNullable<Order["dayActivity"]>): string {
  const m2 = `${formatNumber(a.area, 2)} м²`;
  if (a.trucks.length) return `Жўнатма ${a.trucks.join(", ")} · ${m2}`;
  if (a.single) return `Юкланди · ${m2}`;
  if (a.leftToShip) return `Қолган · ${m2}`;
  if (a.remainder) return `Етказилди · ${m2}`;
  return "Бошқа куни жўнатилган";
}
```

- [ ] **Step 4: OpenAPI**

In `registry.ts` `OrderListItem`, add before `client:`:

```ts
  dayActivity: z.object({
    area: z.number(), blocks: z.number(), beamCount: z.number(), beamMeters: z.number(),
    trucks: z.array(z.number()), single: z.boolean(), remainder: z.boolean(),
    leftToShip: z.boolean(), scheduledHere: z.boolean(),
  }).optional().describe("Present only with ?day=: what this order put on that calendar day"),
```

Run: `npm run openapi:generate` then `npx vitest run tests/openapi.test.ts` → PASS.

- [ ] **Step 5: Verify + commit**

Run: `npx tsc --noEmit -p .` → 0.

```bash
git add src/app/api/orders/capacity/route.ts src/app/api/orders/route.ts "src/app/(app)/orders/page.tsx" src/lib/openapi/registry.ts ../docs/api/openapi.json
git commit -m "Feat(calendar) · days show goods that left + what is left to ship; day list follows"
```

---

### Task 4: Stock per truck

**Files:**
- Modify: `precast-crm/prisma/schema.prisma` (Shipment, StockMovement)
- Modify: `precast-crm/src/lib/inventory.ts`; Test: `precast-crm/tests/inventory.test.ts`
- Modify: `precast-crm/src/app/api/orders/[id]/shipments/[sid]/load/route.ts`
- Modify: `precast-crm/src/lib/order-load.ts`
- Modify: `precast-crm/src/app/api/orders/[id]/delivery-proof/route.ts`, `precast-crm/src/app/api/orders/[id]/route.ts`
- Modify: `precast-crm/src/app/api/orders/[id]/cancel/route.ts`

**Interfaces:**
- Consumes: `beamAreaTable`, `truckArea` (Task 1).
- Produces (in `inventory.ts`): `shipmentToInventoryLines(loadedBeams: unknown, loadedBlocks: number | null): InventoryLine[]`; `netWrittenOff(movements: Array<{ change: number; reason: string; kind: InventoryKind; beamLength: number | null }>): InventoryLine[]`; `remainingToWriteOff(orderLines: InventoryLine[], written: InventoryLine[]): InventoryLine[]`; `decrementForDelivery(tx, orderId, lines, actorId?, opts?: { shipmentId?: string | null; note?: string | null })`; `netWrittenOffForOrder(tx, orderId): Promise<InventoryLine[]>`; `logStockWarnings(tx, orderId, warnings): Promise<void>`; `writeOffRemainderOnDelivery(tx, orderId, calculations, actorId?): Promise<void>`.

- [ ] **Step 1: Schema (additive)**

`Shipment` — after `loadedAt DateTime?` add:

```prisma
  // m² this truck carried, worked out from its beams at loading (owner rule
  // 2026-10-06). Saved so a later owner edit never rewrites history. Null on
  // trucks loaded before the column existed — the engine computes those.
  loadedArea Decimal? @db.Decimal(10, 3)
```

and in its relations: `stockMovements StockMovement[]`.

`StockMovement` — add after `orderId String?`:

```prisma
  // The truck that carried these goods (stock is written off per truck at
  // loading). Null for production, manual, single-truck and legacy rows.
  shipmentId        String?
```

relation `shipment Shipment? @relation(fields: [shipmentId], references: [id], onDelete: SetNull)` and `@@index([shipmentId])`.

Run (from `precast-crm/`, after checking `.env` says `localhost:5432/precast_crm_fulfil`): `npx prisma db push --skip-generate && npx prisma generate`. Expected: "in sync", no data-loss prompt.

- [ ] **Step 2: Failing tests** — append to `tests/inventory.test.ts`:

```ts
import { shipmentToInventoryLines, netWrittenOff, remainingToWriteOff } from "../src/lib/inventory";

describe("shipmentToInventoryLines", () => {
  it("turns a truck's counts into beam lines + one block line", () => {
    expect(shipmentToInventoryLines({ "4.07": 40, "4.30": 22, "3.30": 0 }, 980)).toEqual([
      { kind: "BEAM", beamLength: 4.07, quantity: 40 },
      { kind: "BEAM", beamLength: 4.3, quantity: 22 },
      { kind: "BLOCK", beamLength: null, quantity: 980 },
    ]);
  });
  it("ignores junk and empty input", () => {
    expect(shipmentToInventoryLines(null, null)).toEqual([]);
    expect(shipmentToInventoryLines({ x: 3, "3.9": -1 }, 0)).toEqual([]);
  });
});

describe("netWrittenOff", () => {
  it("nets deliveries against restocks per item", () => {
    expect(
      netWrittenOff([
        { change: -40, reason: "DELIVERY", kind: "BEAM", beamLength: 4.07 },
        { change: -980, reason: "DELIVERY", kind: "BLOCK", beamLength: null },
        { change: -21, reason: "DELIVERY", kind: "BEAM", beamLength: 3.9 },
        { change: 21, reason: "CANCELLATION_RESTOCK", kind: "BEAM", beamLength: 3.9 },
        { change: 500, reason: "PRODUCTION", kind: "BLOCK", beamLength: null },
      ]),
    ).toEqual([
      { kind: "BEAM", beamLength: 4.07, quantity: 40 },
      { kind: "BLOCK", beamLength: null, quantity: 980 },
    ]);
  });
  it("is empty for an order that never touched stock (delivered before the stock book)", () => {
    expect(netWrittenOff([])).toEqual([]);
  });
});

describe("remainingToWriteOff", () => {
  const order = [
    { kind: "BEAM" as const, beamLength: 4.07, quantity: 40 },
    { kind: "BEAM" as const, beamLength: 3.9, quantity: 21 },
    { kind: "BLOCK" as const, beamLength: null, quantity: 2029 },
  ];
  it("writes off only what no truck took", () => {
    expect(remainingToWriteOff(order, [
      { kind: "BEAM", beamLength: 4.07, quantity: 40 },
      { kind: "BLOCK", beamLength: null, quantity: 980 },
    ])).toEqual([
      { kind: "BEAM", beamLength: 3.9, quantity: 21 },
      { kind: "BLOCK", beamLength: null, quantity: 1049 },
    ]);
  });
  it("is empty when everything was written off — a second delivery cannot double count", () => {
    expect(remainingToWriteOff(order, order)).toEqual([]);
  });
  it("never goes negative when more was loaded than ordered", () => {
    expect(remainingToWriteOff(order, [{ kind: "BLOCK", beamLength: null, quantity: 3000 }]))
      .toEqual([{ kind: "BEAM", beamLength: 4.07, quantity: 40 }, { kind: "BEAM", beamLength: 3.9, quantity: 21 }]);
  });
});
```

Run: `npx vitest run tests/inventory.test.ts` → FAIL (exports missing).

- [ ] **Step 3: Implement pure helpers** in `inventory.ts` (PURE section):

```ts
/** A truck's recorded counts as inventory lines (beams ascending, blocks last). */
export function shipmentToInventoryLines(loadedBeams: unknown, loadedBlocks: number | null): InventoryLine[] {
  const lines: InventoryLine[] = [];
  if (loadedBeams && typeof loadedBeams === "object" && !Array.isArray(loadedBeams)) {
    const map = new Map<number, number>();
    for (const [k, v] of Object.entries(loadedBeams as Record<string, unknown>)) {
      const len = canonicalBeamLength(k);
      const n = Number(v);
      if (len > 0 && Number.isFinite(n) && n > 0) map.set(len, (map.get(len) ?? 0) + n);
    }
    for (const [len, qty] of Array.from(map.entries()).sort((a, b) => a[0] - b[0])) {
      lines.push({ kind: "BEAM", beamLength: len, quantity: qty });
    }
  }
  const blocks = Number(loadedBlocks ?? 0);
  if (Number.isFinite(blocks) && blocks > 0) lines.push({ kind: "BLOCK", beamLength: null, quantity: blocks });
  return lines;
}

const lineKey = (kind: InventoryKind, len: number | null) => `${kind}:${len == null ? "" : canonicalBeamLength(len)}`;

/**
 * What an order has net taken out of stock: its DELIVERY write-offs minus any
 * CANCELLATION_RESTOCK. Production and manual rows are not the order's.
 */
export function netWrittenOff(
  movements: Array<{ change: number; reason: string; kind: InventoryKind; beamLength: number | null }>,
): InventoryLine[] {
  const net = new Map<string, InventoryLine>();
  for (const m of movements) {
    if (m.reason !== "DELIVERY" && m.reason !== "CANCELLATION_RESTOCK") continue;
    const len = m.kind === "BEAM" && m.beamLength != null ? canonicalBeamLength(m.beamLength) : null;
    const k = lineKey(m.kind, len);
    const cur = net.get(k) ?? { kind: m.kind, beamLength: len, quantity: 0 };
    cur.quantity += -m.change;
    net.set(k, cur);
  }
  return Array.from(net.values()).filter((l) => l.quantity > 0);
}

/** Order lines minus what is already written off, clamped at zero per line. */
export function remainingToWriteOff(orderLines: InventoryLine[], written: InventoryLine[]): InventoryLine[] {
  const done = new Map(written.map((l) => [lineKey(l.kind, l.beamLength), l.quantity]));
  return orderLines
    .map((l) => ({ ...l, quantity: l.quantity - (done.get(lineKey(l.kind, l.beamLength)) ?? 0) }))
    .filter((l) => l.quantity > 0);
}
```

Run: `npx vitest run tests/inventory.test.ts` → PASS.

- [ ] **Step 4: DB helpers** in `inventory.ts`:

1. `MovementInputBase` gains `shipmentId?: string | null;` and `applyStockMovement`'s `stockMovement.create` data gains `shipmentId: movement.shipmentId ?? null,`.
2. `decrementForDelivery(tx, orderId, lines, actorId?, opts?: { shipmentId?: string | null; note?: string | null })` passes `shipmentId: opts?.shipmentId ?? null, note: opts?.note ?? null` into the movement.
3. Add:

```ts
/** The order's net written-off lines, read from its own movement history. */
export async function netWrittenOffForOrder(tx: TxClient, orderId: string): Promise<InventoryLine[]> {
  const rows = await tx.stockMovement.findMany({
    where: { orderId, reason: { in: ["DELIVERY", "CANCELLATION_RESTOCK"] } },
    select: { change: true, reason: true, inventoryItem: { select: { kind: true, beamLength: true } } },
  });
  return netWrittenOff(
    rows.map((r) => ({
      change: r.change,
      reason: r.reason,
      kind: r.inventoryItem.kind,
      beamLength: r.inventoryItem.beamLength == null ? null : Number(r.inventoryItem.beamLength),
    })),
  );
}

/** One STOCK_WARNING event per item that went negative (existing wording). */
export async function logStockWarnings(tx: TxClient, orderId: string, warnings: NegativeStockWarning[]): Promise<void> {
  for (const w of warnings) {
    await tx.orderEvent.create({
      data: {
        orderId,
        type: "STOCK_WARNING",
        message: `Stock went negative for ${formatInventoryLabel(w.kind, w.beamLength)} (now ${w.resultingQuantity}). Reconcile production log.`,
        payload: w as object,
      },
    });
  }
}

/**
 * Order → DELIVERED: write off only what no truck (or single-truck load)
 * already wrote off. Never twice; on a legacy order with no loading record it
 * writes off the whole order, exactly as before.
 */
export async function writeOffRemainderOnDelivery(
  tx: TxClient,
  orderId: string,
  calculations: Parameters<typeof calcSnapshotToInventoryLines>[0],
  actorId?: string | null,
): Promise<void> {
  const written = await netWrittenOffForOrder(tx, orderId);
  const lines = remainingToWriteOff(calcSnapshotToInventoryLines(calculations), written);
  const warnings = await decrementForDelivery(tx, orderId, lines, actorId, {
    note: written.length > 0 ? "Етказилди — юкланмай қолган қолдиқ" : null,
  });
  await logStockWarnings(tx, orderId, warnings);
}
```

- [ ] **Step 5: Shipment load route** (`shipments/[sid]/load/route.ts`)

- Add `monolithArea: true` to the calculations select.
- Before the transaction:

```ts
    // m² this truck carries, from its beams (owner rule 2026-10-06). Saved on
    // the truck so a later owner edit never rewrites what already left.
    const loadedArea = truckArea(
      loadedBeams,
      beamAreaTable(order.project.calculations.map((c) => ({
        beamLength: Number(c.beamLength), beamCount: c.beamCount,
        totalBlocks: c.totalBlocks, monolithArea: Number(c.monolithArea),
      }))),
    );
```

- In `tx.shipment.update` data add `loadedArea: Math.round(loadedArea * 1000) / 1000,`.
- After the `galleryPhoto.create` in the transaction:

```ts
      // Stock leaves the yard with the truck (owner rule 2026-10-06).
      const warnings = await decrementForDelivery(
        tx, params.id, shipmentToInventoryLines(loadedBeams, loadedBlocks), user.id,
        { shipmentId: params.sid, note: `Жўнатма ${shipment.number}` },
      );
      await logStockWarnings(tx, params.id, warnings);
```

Imports: `beamAreaTable, truckArea` from `@/lib/fulfilment`; `decrementForDelivery, logStockWarnings, shipmentToInventoryLines` from `@/lib/inventory`.

- [ ] **Step 6: Single-truck load** (`src/lib/order-load.ts`) — inside the transaction, after the `galleryPhoto.create`:

```ts
    // The whole order leaves the yard on this truck: write its stock off now.
    const { project } = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { project: { select: { calculations: true } } },
    });
    const warnings = await decrementForDelivery(
      tx, orderId, calcSnapshotToInventoryLines(project.calculations), userId, { note: "Битта машина" },
    );
    await logStockWarnings(tx, orderId, warnings);
```

Imports from `@/lib/inventory`. Update the function doc: also writes off stock.

- [ ] **Step 7: DELIVERED paths**

`delivery-proof/route.ts`: delete the `const project = …` / `const inventoryLines = …` pre-transaction lines and replace the `decrementForDelivery` + warning loop inside the transaction with:

```ts
    // Write off only what no truck already wrote off (owner rule 2026-10-06).
    const project = await tx.project.findUniqueOrThrow({
      where: { id: order.projectId },
      include: { calculations: true },
    });
    await writeOffRemainderOnDelivery(tx, order.id, project.calculations, user.id);
```

`orders/[id]/route.ts` PATCH: keep the `willTransitionToDelivered` flag; delete the `inventoryLines` pre-fetch; inside the transaction replace the decrement + warnings with:

```ts
    if (willTransitionToDelivered) {
      const project = await tx.project.findUniqueOrThrow({
        where: { id: existing.projectId },
        include: { calculations: true },
      });
      await writeOffRemainderOnDelivery(tx, existing.id, project.calculations, user.id);
    }
```

Fix imports in both files (remove `calcSnapshotToInventoryLines`, `decrementForDelivery`, `formatInventoryLabel` where now unused; add `writeOffRemainderOnDelivery`).

- [ ] **Step 8: Cancel route** — replace the `wasDelivered`/`restockLines` pre-fetch and the `if (wasDelivered) restockForCancellation(…)` with, inside the transaction (before the `orderEvent.create`):

```ts
      // Return exactly what this order took out of stock — per truck or at
      // delivery. An order that never wrote stock off restocks nothing.
      const restockLines = await netWrittenOffForOrder(tx, existing.id);
      if (restockLines.length > 0) {
        await restockForCancellation(tx, existing.id, restockLines, user.id, body.reason ?? null);
      }
```

and set the event payload `restocked: restockLines.length > 0`. Update the header comment. Imports: `netWrittenOffForOrder, restockForCancellation`.

- [ ] **Step 9: Verify + commit**

Run: `npx tsc --noEmit -p .` → 0; `npx vitest run` → all PASS.

```bash
git add prisma/schema.prisma src/lib/inventory.ts tests/inventory.test.ts "src/app/api/orders/[id]/shipments/[sid]/load/route.ts" src/lib/order-load.ts "src/app/api/orders/[id]/delivery-proof/route.ts" "src/app/api/orders/[id]/route.ts" "src/app/api/orders/[id]/cancel/route.ts"
git commit -m "Feat(stock) · write stock off per truck at loading; delivery writes off only the rest"
```

---

### Task 5: Owner-only editing of partly shipped orders

**Files:**
- Modify: `precast-crm/src/lib/permissions.ts`
- Create: `precast-crm/src/lib/order-edit-policy.ts`; Test: `precast-crm/src/lib/order-edit-policy.test.ts`
- Modify: `precast-crm/src/app/api/orders/[id]/edit/route.ts`
- Modify: `precast-crm/src/app/(app)/orders/[id]/page.tsx` (Edit button)

**Interfaces:**
- Consumes: `orderBeamLines`, `loadedByLength`, `lengthKey`, `FulfilmentShipment` (Task 1).
- Produces: `type EditLockReason = 'NO_PERMISSION' | 'CANCELED' | 'DELIVERED' | 'ON_TRUCK' | 'NEEDS_SHIPPED_PERMISSION'`; `editPolicy(i: { status: string; shipments: Array<{ loadedAt: Date | string | null }>; permissions: readonly string[] }): { allowed: boolean; reason: EditLockReason | null; shipped: boolean }`; `editLockMessage(r: EditLockReason): string`; `interface FloorViolation { length: string | null; loaded: number; ordered: number }`; `loadedFloorViolations(next: { beams: Record<string, number>; blocks: number }, loaded: { beams: Record<string, number>; blocks: number }): FloorViolation[]`; `floorViolationMessage(v: FloorViolation[]): string`.

- [ ] **Step 1: Permission** — in `permissions.ts`: add `"order.editShipped", // owner-only · edit an order after a truck was loaded` to `ACTIONS` after `"order.edit"`; add it to the `calculator` group after `"order.edit"`; label `"order.editShipped": "Жўнатилган буюртмани таҳрирлаш · Edit partly shipped orders (owner-only)"`. Add to **no** role template.

- [ ] **Step 2: Failing tests** — `src/lib/order-edit-policy.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { editPolicy, editLockMessage, loadedFloorViolations, floorViolationMessage } from './order-edit-policy';

const OWNER = ['order.edit', 'order.editShipped'];
const OPERATOR = ['order.edit'];
const loaded = [{ loadedAt: '2026-08-29T14:55:06.215Z' }, { loadedAt: null }];

describe('editPolicy', () => {
  it('nothing loaded: anyone with order.edit, as today', () => {
    expect(editPolicy({ status: 'PLACED', shipments: [], permissions: OPERATOR })).toEqual({ allowed: true, reason: null, shipped: false });
    expect(editPolicy({ status: 'IN_PRODUCTION', shipments: [{ loadedAt: null }], permissions: OPERATOR }).allowed).toBe(true);
  });
  it('a truck loaded: only the shipped-order permission', () => {
    expect(editPolicy({ status: 'DISPATCHED', shipments: loaded, permissions: OPERATOR })).toEqual({ allowed: false, reason: 'NEEDS_SHIPPED_PERMISSION', shipped: true });
    expect(editPolicy({ status: 'DISPATCHED', shipments: loaded, permissions: OWNER })).toEqual({ allowed: true, reason: null, shipped: true });
    expect(editPolicy({ status: 'PLACED', shipments: loaded, permissions: OPERATOR }).reason).toBe('NEEDS_SHIPPED_PERMISSION');
  });
  it('never after delivery or cancel, even for the owner', () => {
    expect(editPolicy({ status: 'DELIVERED', shipments: loaded, permissions: OWNER }).reason).toBe('DELIVERED');
    expect(editPolicy({ status: 'CANCELED', shipments: [], permissions: OWNER }).reason).toBe('CANCELED');
  });
  it('single truck already on a truck: locked for everyone', () => {
    expect(editPolicy({ status: 'LOADED', shipments: [], permissions: OWNER }).reason).toBe('ON_TRUCK');
    expect(editPolicy({ status: 'DISPATCHED', shipments: [], permissions: OWNER }).reason).toBe('ON_TRUCK');
  });
  it('no order.edit: locked', () => {
    expect(editPolicy({ status: 'PLACED', shipments: [], permissions: [] }).reason).toBe('NO_PERMISSION');
  });
  it('every lock reason has an Uzbek message', () => {
    for (const r of ['NO_PERMISSION', 'CANCELED', 'DELIVERED', 'ON_TRUCK', 'NEEDS_SHIPPED_PERMISSION'] as const) {
      expect(editLockMessage(r)).toMatch(/[А-Яа-яЎўҚқҒғҲҳ]/);
    }
  });
});

describe('loadedFloorViolations', () => {
  const already = { beams: { '4.07': 40, '4.30': 22 }, blocks: 980 };
  it('accepts an edit that keeps or grows what was loaded', () => {
    expect(loadedFloorViolations({ beams: { '4.07': 40, '4.30': 25, '5.10': 10 }, blocks: 1200 }, already)).toEqual([]);
  });
  it('lists every beam length and the blocks that would drop below loaded', () => {
    expect(loadedFloorViolations({ beams: { '4.07': 30 }, blocks: 900 }, already)).toEqual([
      { length: '4.07', loaded: 40, ordered: 30 },
      { length: '4.30', loaded: 22, ordered: 0 },
      { length: null, loaded: 980, ordered: 900 },
    ]);
  });
  it('message names each problem in Uzbek', () => {
    const msg = floorViolationMessage([{ length: '4.07', loaded: 40, ordered: 30 }, { length: null, loaded: 980, ordered: 900 }]);
    expect(msg).toContain('4.07 м балка: юкланган 40, янгисида 30');
    expect(msg).toContain('Ғишт: юкланган 980, янгисида 900');
  });
});
```

Run: `npx vitest run src/lib/order-edit-policy.test.ts` → FAIL.

- [ ] **Step 3: Implement** — `src/lib/order-edit-policy.ts`:

```ts
// Who may edit an order, and what an edit may not undo (owner rules 2026-10-06).
//
// Once ANY truck is loaded the goods on it are history, so only holders of
// `order.editShipped` (the owner) may edit the order, until it is delivered.
// No edit may drop a beam length or the block total below what already left.

export type EditLockReason = 'NO_PERMISSION' | 'CANCELED' | 'DELIVERED' | 'ON_TRUCK' | 'NEEDS_SHIPPED_PERMISSION';

export function editPolicy(i: {
  status: string;
  shipments: Array<{ loadedAt: Date | string | null }>;
  permissions: readonly string[];
}): { allowed: boolean; reason: EditLockReason | null; shipped: boolean } {
  const shipped = i.shipments.some((s) => s.loadedAt != null);
  const lock = (reason: EditLockReason) => ({ allowed: false, reason, shipped });
  if (!i.permissions.includes('order.edit')) return lock('NO_PERMISSION');
  if (i.status === 'CANCELED') return lock('CANCELED');
  if (i.status === 'DELIVERED') return lock('DELIVERED');
  // Single-truck order already on its truck: the whole order left at once.
  if (i.shipments.length === 0 && (i.status === 'LOADED' || i.status === 'DISPATCHED')) return lock('ON_TRUCK');
  if (shipped && !i.permissions.includes('order.editShipped')) return lock('NEEDS_SHIPPED_PERMISSION');
  return { allowed: true, reason: null, shipped };
}

export function editLockMessage(r: EditLockReason): string {
  switch (r) {
    case 'NO_PERMISSION': return 'Буюртмаларни таҳрирлашга рухсат йўқ';
    case 'CANCELED': return 'Бекор қилинган буюртмани таҳрирлаб бўлмайди';
    case 'DELIVERED': return 'Етказилган буюртмани таҳрирлаб бўлмайди';
    case 'ON_TRUCK': return 'Буюртма тўлиқ машинага юкланган — таҳрирлаб бўлмайди';
    case 'NEEDS_SHIPPED_PERMISSION': return 'Юк жўнатилган — фақат эгаси таҳрирлай олади';
  }
}

export interface FloorViolation {
  /** Beam length key ("4.07"), or null for blocks. */
  length: string | null;
  loaded: number;
  ordered: number;
}

export function loadedFloorViolations(
  next: { beams: Record<string, number>; blocks: number },
  loaded: { beams: Record<string, number>; blocks: number },
): FloorViolation[] {
  const out: FloorViolation[] = [];
  for (const [k, n] of Object.entries(loaded.beams)) {
    const ordered = next.beams[k] ?? 0;
    if (ordered < n) out.push({ length: k, loaded: n, ordered });
  }
  if (next.blocks < loaded.blocks) out.push({ length: null, loaded: loaded.blocks, ordered: next.blocks });
  return out;
}

export function floorViolationMessage(v: FloorViolation[]): string {
  const parts = v.map((x) =>
    x.length == null
      ? `Ғишт: юкланган ${x.loaded}, янгисида ${x.ordered}`
      : `${x.length} м балка: юкланган ${x.loaded}, янгисида ${x.ordered}`,
  );
  return `Юкланганидан кам қилиб бўлмайди — ${parts.join('; ')}`;
}
```

Run: `npx vitest run src/lib/order-edit-policy.test.ts` → PASS.

- [ ] **Step 4: Edit route guards** (`edit/route.ts`)

- `existing` include gains `shipments: { select: { loadedAt: true, loadedBeams: true, loadedBlocks: true } }`.
- Replace the status `if (… DISPATCHED || DELIVERED || CANCELED)` block with:

```ts
    const policy = editPolicy({ status: existing.status, shipments: existing.shipments, permissions: user.permissions });
    if (!policy.allowed) {
      return fail(editLockMessage(policy.reason!), policy.reason === 'NEEDS_SHIPPED_PERMISSION' ? 403 : 422);
    }
```

- After `totalBeams` is computed:

```ts
    // A truck's goods already left: the edit may not go below them.
    if (policy.shipped) {
      const nextBeams: Record<string, number> = {};
      for (const c of computed) {
        const k = lengthKey(c.result.beam_length);
        nextBeams[k] = (nextBeams[k] ?? 0) + c.result.beam_count;
      }
      const violations = loadedFloorViolations(
        { beams: nextBeams, blocks: totalBlocks },
        loadedByLength(existing.shipments.map((s, i) => ({
          number: i + 1, status: '', loadedAt: s.loadedAt, deliveredAt: null,
          loadedBeams: s.loadedBeams, loadedBlocks: s.loadedBlocks, loadedArea: null,
        }))),
      );
      if (violations.length > 0) return fail(floorViolationMessage(violations), 422);
    }
```

- Update the header "Status policy" comment to the new table. Imports: `editPolicy, editLockMessage, loadedFloorViolations, floorViolationMessage` from `@/lib/order-edit-policy`; `lengthKey, loadedByLength` from `@/lib/fulfilment`.

- [ ] **Step 5: Order page Edit button** — replace `const editable = order.status === "PLACED" || order.status === "IN_PRODUCTION";` with:

```tsx
                  const policy = editPolicy({ status: order.status, shipments: order.shipments, permissions: me?.permissions ?? [] });
                  const editable = policy.allowed;
```

and the locked `title` with `editLockMessage(policy.reason ?? "NO_PERMISSION")`. Import from `@/lib/order-edit-policy`.

- [ ] **Step 6: Verify + commit**

Run: `npx tsc --noEmit -p .` → 0; `npx vitest run` → PASS.

```bash
git add src/lib/permissions.ts src/lib/order-edit-policy.ts src/lib/order-edit-policy.test.ts "src/app/api/orders/[id]/edit/route.ts" "src/app/(app)/orders/[id]/page.tsx"
git commit -m "Feat(orders) · owner can edit partly shipped orders; edits never go below what left"
```

---

### Task 6: Reschedule button

**Files:**
- Modify: `precast-crm/src/app/api/orders/[id]/route.ts` (PATCH guard)
- Create: `precast-crm/src/components/orders/RescheduleDialog.tsx`
- Modify: `precast-crm/src/app/(app)/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `CapacityCalendar` (`value`, `onChange`, `pendingArea`, `disablePast`); `orderFulfilment`, `toFulfilmentInput` (Task 1); `api` from `@/lib/fetcher`.
- Produces: `RescheduleDialog({ open, onClose, orderId, current, previewArea, formatLabel, onSaved })`.

- [ ] **Step 1: PATCH guard** — in `PATCH /api/orders/[id]`, at the top of `if (body.scheduledAt && … !== …) {`:

```ts
    if (existing.status === "DELIVERED") {
      return fail("Етказилган буюртманинг санасини ўзгартириб бўлмайди · A delivered order cannot be rescheduled", 422);
    }
```

(Place the check before `updates.scheduledAt = …`; it must return before any write.)

- [ ] **Step 2: Dialog** — `src/components/orders/RescheduleDialog.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CalendarClock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CapacityCalendar } from "@/components/orders/CapacityCalendar";
import { api } from "@/lib/fetcher";
import { formatNumber } from "@/lib/utils";

/**
 * Date-only reschedule (owner 2026-10-06): pick a day on the orders calendar,
 * press «Сақлаш», confirm. Sends PATCH /api/orders/[id] { scheduledAt } — no
 * re-pricing, unlike edit → save. The preview m² is what is still left to ship.
 */
export function RescheduleDialog({
  open, onClose, orderId, current, previewArea, formatLabel, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  current: Date;
  previewArea: number;
  formatLabel: (d: Date) => string;
  onSaved: () => void;
}) {
  const [date, setDate] = useState<Date | null>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { if (open) { setDate(null); setConfirming(false); } }, [open]);

  const save = useMutation({
    mutationFn: (d: Date) => api(`/api/orders/${orderId}`, { method: "PATCH", json: { scheduledAt: d } }),
    onSuccess: () => { onSaved(); onClose(); },
  });

  if (!open) return null;
  const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const changed = date != null && !sameDay(date, current);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-border" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2"><CalendarClock className="h-5 w-5" />Санани ўзгартириш</h2>
            <p className="text-xs text-muted-foreground">Ҳозирги сана: <span className="font-semibold">{formatLabel(current)}</span></p>
          </div>
          <button type="button" onClick={onClose} className="h-11 w-11 inline-flex items-center justify-center rounded hover:bg-muted" aria-label="Ёпиш">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {!confirming ? (
            <>
              <CapacityCalendar value={date} onChange={setDate} pendingArea={previewArea} disablePast />
              <p className="text-xs text-muted-foreground">
                Календарда шу буюртманинг жўнатилмаган қисми кўрсатилади:{" "}
                <span className="font-mono tabular-nums">{formatNumber(previewArea, 2)} м²</span>
              </p>
            </>
          ) : (
            <div className="rounded-md border border-border bg-muted/30 px-4 py-5 text-center">
              <div className="text-sm text-muted-foreground mb-1">Етказиб бериш санаси ўзгарсинми?</div>
              <div className="text-lg font-semibold">
                {formatLabel(current)} <span className="text-muted-foreground">→</span> {date ? formatLabel(date) : ""}
              </div>
            </div>
          )}
          {save.isError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {(save.error as Error).message || "Санани ўзгартиришда хато"}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          {!confirming ? (
            <>
              <Button variant="outline" onClick={onClose}>Бекор</Button>
              <Button disabled={!changed} onClick={() => setConfirming(true)}>Сақлаш</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setConfirming(false)} disabled={save.isPending}>Бекор</Button>
              <Button onClick={() => date && save.mutate(date)} disabled={save.isPending}>
                {save.isPending ? "Сақланмоқда…" : "Ҳа, ўзгартириш"}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Button + wiring on the order page**

- `OrderDetail.shipments[]` gains `loadedArea: string | null;`; `OrderDetail.project.calculations[]` must expose `beamLength`, `beamCount`, `totalBlocks`, `monolithArea` (check the existing type; add any missing as `string`/`number`).
- State: `const [rescheduleOpen, setRescheduleOpen] = useState(false);`
- Preview (inside the component, after `order` is known):

```tsx
  const leftToShipArea = useMemo(
    () => (order ? orderFulfilment(toFulfilmentInput(order)).leftToShip.area : 0),
    [order],
  );
```

- Button, right after the Edit button block:

```tsx
                {canEditOrder && order.status !== "DELIVERED" && order.status !== "CANCELED" && (
                  <Button variant="outline" size="sm" onClick={() => setRescheduleOpen(true)} title={t("Етказиб бериш санасини ўзгартириш", "Change the delivery date")}>
                    <CalendarClock className="h-3.5 w-3.5 mr-1.5" />
                    {t("Санани ўзгартириш", "Reschedule")}
                  </Button>
                )}
```

- Dialog near the other dialogs:

```tsx
      <RescheduleDialog
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        orderId={order.id}
        current={new Date(order.scheduledAt)}
        previewArea={leftToShipArea}
        formatLabel={(d) => `${WEEKDAY_UZ[d.getDay()]}, ${formatDate(d)}`}
        onSaved={() => qc.invalidateQueries({ queryKey: ["order", params.id] })}
      />
```

Imports: `CalendarClock` (lucide-react), `RescheduleDialog`, `orderFulfilment, toFulfilmentInput` from `@/lib/fulfilment`.

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit -p .` → 0.

```bash
git add "src/app/api/orders/[id]/route.ts" src/components/orders/RescheduleDialog.tsx "src/app/(app)/orders/[id]/page.tsx"
git commit -m "Feat(orders) · reschedule button: calendar, confirm, date-only change"
```

---

### Task 7: One-time backfill script

**Files:**
- Create: `precast-crm/scripts/backfill-truck-fulfilment.ts`

**Interfaces:**
- Consumes: `beamAreaTable`, `truckArea` (Task 1); `shipmentToInventoryLines`, `calcSnapshotToInventoryLines`, `decrementForDelivery`, `logStockWarnings` (Task 4).

- [ ] **Step 1: Write the script**

```ts
/**
 * One-time backfill for truck fulfilment (spec §9). DRY RUN by default.
 *
 *   npx tsx scripts/backfill-truck-fulfilment.ts            # report only
 *   npx tsx scripts/backfill-truck-fulfilment.ts --apply    # write
 *
 * 1. Shipment.loadedArea for loaded trucks where it is null (new column only).
 * 2. Stock write-off for trucks already loaded on orders that are not yet
 *    delivered or canceled and have no write-off yet — split trucks per
 *    shipment, single-truck LOADED orders by order lines. Without this they
 *    are written off at «Етказилган», which is still correct, only later.
 */
import { PrismaClient } from "@prisma/client";
import { beamAreaTable, truckArea } from "../src/lib/fulfilment";
import {
  calcSnapshotToInventoryLines,
  decrementForDelivery,
  logStockWarnings,
  shipmentToInventoryLines,
} from "../src/lib/inventory";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(APPLY ? "== APPLY ==" : "== DRY RUN (nothing is written) ==");

  // 1. m² per loaded truck
  const ships = await prisma.shipment.findMany({
    where: { loadedAt: { not: null }, loadedArea: null },
    select: {
      id: true, number: true, loadedBeams: true,
      order: { select: { orderNumber: true, project: { select: { calculations: { select: { beamLength: true, beamCount: true, totalBlocks: true, monolithArea: true } } } } } },
    },
  });
  let areaSum = 0;
  for (const s of ships) {
    const table = beamAreaTable(s.order.project.calculations.map((c) => ({
      beamLength: Number(c.beamLength), beamCount: c.beamCount, totalBlocks: c.totalBlocks, monolithArea: Number(c.monolithArea),
    })));
    const area = Math.round(truckArea(s.loadedBeams, table) * 1000) / 1000;
    areaSum += area;
    if (APPLY) await prisma.shipment.update({ where: { id: s.id }, data: { loadedArea: area } });
  }
  console.log(`1. loadedArea: ${ships.length} trucks, Σ ${areaSum.toFixed(1)} m²`);

  // 2. stock for trucks already gone on open orders
  const open = await prisma.order.findMany({
    where: { status: { notIn: ["DELIVERED", "CANCELED", "DRAFT"] } },
    select: {
      id: true, orderNumber: true, status: true, loadedAt: true,
      project: { select: { calculations: true } },
      shipments: { where: { loadedAt: { not: null } }, select: { id: true, number: true, loadedBeams: true, loadedBlocks: true } },
      stockMovements: { where: { reason: "DELIVERY" }, select: { shipmentId: true } },
    },
  });
  let trucks = 0;
  for (const o of open) {
    const done = new Set(o.stockMovements.map((m) => m.shipmentId));
    const work: Array<{ label: string; shipmentId: string | null; lines: ReturnType<typeof shipmentToInventoryLines> }> = [];
    if (o.shipments.length > 0) {
      for (const s of o.shipments) {
        if (done.has(s.id)) continue;
        work.push({ label: `Жўнатма ${s.number} (олдинги юклаш)`, shipmentId: s.id, lines: shipmentToInventoryLines(s.loadedBeams, s.loadedBlocks) });
      }
    } else if (o.loadedAt && o.stockMovements.length === 0) {
      work.push({ label: "Битта машина (олдинги юклаш)", shipmentId: null, lines: calcSnapshotToInventoryLines(o.project.calculations) });
    }
    for (const w of work) {
      trucks += 1;
      console.log(`2. ${o.orderNumber} · ${w.label} · ${w.lines.map((l) => `${l.kind === "BLOCK" ? "ғишт" : l.beamLength + "м"}×${l.quantity}`).join(", ")}`);
      if (APPLY) {
        await prisma.$transaction(async (tx) => {
          const warnings = await decrementForDelivery(tx, o.id, w.lines, null, { shipmentId: w.shipmentId, note: w.label });
          await logStockWarnings(tx, o.id, warnings);
        });
      }
    }
  }
  console.log(`2. stock: ${trucks} truck loads ${APPLY ? "written off" : "would be written off"}`);
}

main().finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Dry run locally** — `npx tsx scripts/backfill-truck-fulfilment.ts` → prints both sections, writes nothing. Then `npx tsc --noEmit -p .` → 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-truck-fulfilment.ts
git commit -m "Chore(scripts) · one-time truck fulfilment backfill (dry run by default)"
```

---

### Task 8: End-to-end verification (local)

**Files:**
- Create: `precast-crm/scripts/smoke-truck-fulfilment.ts`

- [ ] **Step 1: Seed local DB** — `npm run db:seed` against `precast_crm_fulfil` (check `.env` first). Grant the seeded owner `order.editShipped` in the smoke script setup via Prisma.

- [ ] **Step 2: Smoke script** — refuses to run unless `BASE_URL` starts with `http://localhost` and `DATABASE_URL` contains `localhost`. Logs in as `owner@precast.local` and `sales@precast.local` via `POST /api/auth/login` (bearer token), then over HTTP:
  1. place an order (two beam lengths) → split → load truck 1 with one length + some blocks;
  2. assert: `StockMovement` rows for truck 1 with `shipmentId`; `Shipment.loadedArea` = engine value; inventory decreased by exactly truck 1;
  3. as sales: `PATCH /edit` → 403 «Юк жўнатилган…»; as owner: edit dropping the loaded length below loaded → 422 floor message; owner edit adding a room → 200;
  4. `GET /api/orders/capacity` and `?day=` for truck day and scheduled day → truck m² on the truck day, left-to-ship on scheduled day, `dayActivity` tags;
  5. `PATCH /api/orders/:id { scheduledAt }` → moves left-to-ship; load truck 2 (the rest) → dispatch → deliver both → record full payment → `PATCH status=DELIVERED` → no extra stock movement beyond trucks (remainder empty) unless trucks under-loaded;
  6. reschedule a DELIVERED order → 422;
  7. a second order single-truck: `/load` → stock written off at load; `delivery-proof` → no second write-off; cancel → restocked exactly.
  Prints PASS/FAIL per check; exit 1 on any FAIL.

- [ ] **Step 3: Run** — `npm run dev -- -p 3100` (background) then `BASE_URL=http://localhost:3100 npx tsx scripts/smoke-truck-fulfilment.ts` → all PASS.

- [ ] **Step 4: UI check** — in the browser (light and dark): order page shows «Санани ўзгартириш»; dialog → pick → «Сақлаш» → confirmation → date changes; Edit button locked with tooltip for a sales user on a shipped order; orders page day filter tags; dashboard «Юкланган ҳажм» and «Бугунги етказишлар».

- [ ] **Step 5: Full gates** — `npx tsc --noEmit -p .`, `npx vitest run`, `npx next lint`, `npm run build` → all clean. Docker-context check: no file outside `tests/` imports from `tests/`.

- [ ] **Step 6: Commit** — `git add scripts/smoke-truck-fulfilment.ts && git commit -m "Test(smoke) · local end-to-end check for truck fulfilment"`

---

### Task 9: Deploy

- [ ] **Step 1:** Read-only prod data check (needs owner permission): count unknown beam keys on loaded shipments; list part-shipped open orders; single-truck LOADED orders; current stock levels.
- [ ] **Step 2:** `git fetch && git log --oneline HEAD..origin/main | wc -l` must be 0; push `feat/truck-fulfilment:main` (fast-forward).
- [ ] **Step 3:** Server (per `reference_deploy`): DB dump `/root/precast-predeploy-2026-10-06-*.sql.gz`; tag rollback image; `git pull`; `(setsid nohup docker compose build app > /root/build.log 2>&1 &)`; poll `grep "Image precast-crm-app Built" /root/build.log`; `docker compose run --rm --no-deps app npx prisma db push --skip-generate` (must report no data loss); `docker compose up -d app`; prove running image == built image; smoke `GET /api/orders/capacity` 200.
- [ ] **Step 4:** Backfill dry run on prod (`docker compose exec -T app npx tsx scripts/backfill-truck-fulfilment.ts`) → show the owner → `--apply` only after the owner confirms.
- [ ] **Step 5:** Owner ticks «Жўнатилган буюртмани таҳрирлаш» for their account (Users page).
- [ ] **Step 6:** Update memory (deploy reference, project memory for this feature).
