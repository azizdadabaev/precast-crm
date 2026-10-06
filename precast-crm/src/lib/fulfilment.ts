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
      const parsed = beamsFromLoadedJson(s.loadedBeams);
      events.push({
        at: s.loadedAt as Date,
        source: 'shipment',
        shipmentNumber: s.number,
        beamsByLength: beamsByLengthFromJson(s.loadedBeams),
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
      const onTrucks = o.loadedAt && loaded.length === 0 ? lines : already.beams;
      for (const [k, n] of Object.entries(lines)) {
        const left = n - (onTrucks[k] ?? 0);
        if (left > 0) restBeams[k] = left;
      }
      events.push({ at: completedAt, source: 'remainder', shipmentNumber: null, beamsByLength: restBeams, ...rest });
    }
  }

  // A single-truck order already on its truck has nothing left in the yard.
  const onTruckWhole = o.shipments.length === 0 && (o.loadedAt != null || o.status === 'LOADED' || o.status === 'DISPATCHED');
  let leftToShip: LeftToShip = none;
  if (!completedAt && !onTruckWhole) {
    const beams: Record<string, number> = {};
    for (const [k, n] of Object.entries(lines)) {
      const left = n - (already.beams[k] ?? 0);
      if (left > 0) beams[k] = left;
    }
    const blocksLeft = Math.max(0, o.totalBlocks - already.blocks);
    // Nothing physical left in the yard → nothing left to ship. Without this,
    // per-truck m² rounding (3 dp) can leave a phantom 0,001 m² that would put
    // the order on its scheduled day; completion still recovers any m².
    if (piecesOf(beams) > 0 || blocksLeft > 0) {
      const truckM2 = events.filter((e) => e.source === 'shipment').reduce((s, e) => s + e.area, 0);
      leftToShip = {
        beamsByLength: beams,
        blocks: blocksLeft,
        beamCount: piecesOf(beams),
        beamMeters: metresOf(beams),
        area: Math.max(0, o.totalArea - truckM2),
      };
    }
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
  const c: DayContribution = {
    ...EMPTY, trucks: [], single: false, remainder: false, leftToShip: false,
    scheduledHere: dayKey(f.scheduledAt) === day,
  };
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
const toDate = (v: DateLike): Date | null => (v == null ? null : v instanceof Date ? v : new Date(v));

export function toFulfilmentInput(raw: RawFulfilmentOrder): FulfilmentInput {
  return {
    status: raw.status,
    loadedAt: toDate(raw.loadedAt),
    deliveredAt: toDate(raw.deliveredAt),
    scheduledAt: toDate(raw.scheduledAt) as Date,
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
      loadedAt: toDate(s.loadedAt),
      deliveredAt: toDate(s.deliveredAt),
      loadedBeams: s.loadedBeams,
      loadedBlocks: s.loadedBlocks,
      loadedArea: s.loadedArea == null ? null : num(s.loadedArea),
    })),
  };
}
