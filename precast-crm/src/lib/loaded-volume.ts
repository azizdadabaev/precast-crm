// Monthly loading volume — how much product physically left the yard.
//
// The CRM records loading two ways, and they are mutually exclusive in the
// data (verified on prod: of the 69 live orders that use shipments, ZERO also
// set `Order.loadedAt`), so the two sources are summed without double-counting:
//
//   1. SINGLE TRUCK — `Order.loadedAt` is stamped and no quantities are
//      recorded, which means the whole order went on one truck. Quantities
//      come from the order's own rooms.
//   2. SPLIT SHIPMENT — each `Shipment` carries `loadedBeams`
//      (`{ "3.35": 20, "3.90": 28 }`, i.e. beam length → piece count) and
//      `loadedBlocks`. These are what the operator actually counted onto the
//      truck, so they are used verbatim.
//
// Beam METRES are the point of this module: a piece count alone cannot be
// compared across orders because a 3.35 m beam and a 6.40 m beam are one piece
// each. Metres come from Σ(count × length) — for rooms that is
// `beamCount × beamLength`, for shipments it is the JSON map above.
//
// Read-only. Nothing here writes, and no stored snapshot is recomputed.

/** One month's loaded totals. */
export interface LoadedVolume {
  /** Filler blocks loaded. Exact. */
  blocks: number;
  /** Beam pieces loaded. Exact. */
  beamCount: number;
  /** Beam metres loaded — Σ(pieces × length). Exact. */
  beamMeters: number;
  /** Floor area loaded, in m². Exact per order; apportioned across trucks. */
  area: number;
  /** Distinct orders that had product loaded this month. */
  orderCount: number;
}

/** A single loading event, already reduced to plain numbers and a month. */
export interface LoadEvent {
  /** `YYYY-MM`, derived from the loading timestamp in SERVER-LOCAL time. */
  monthKey: string;
  orderId: string;
  blocks: number;
  beamCount: number;
  beamMeters: number;
  area: number;
}

export function emptyVolume(): LoadedVolume {
  return { blocks: 0, beamCount: 0, beamMeters: 0, area: 0, orderCount: 0 };
}

/**
 * `YYYY-MM` for a loading timestamp, in server-local time.
 *
 * Local, never UTC: the app runs with `TZ=Asia/Tashkent` (+05) and a truck
 * loaded at 02:00 local on the 1st is still the 1st here but the PREVIOUS
 * month in UTC. Bucketing on UTC would file that load under the wrong month.
 */
export function loadMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Beam pieces and metres from a shipment's `loadedBeams` JSON.
 *
 * Shape is `Record<lengthInMeters, pieceCount>`. Keys are strings because JSON
 * object keys always are — `"3.35"` parses to 3.35. Zero counts appear in real
 * rows (the operator lists a length then loads none of it) and contribute
 * nothing. Anything unparseable is skipped rather than turned into NaN, which
 * would silently poison the whole month's total.
 */
export function beamsFromLoadedJson(json: unknown): { count: number; meters: number } {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { count: 0, meters: 0 };
  let count = 0;
  let meters = 0;
  for (const [lengthKey, rawCount] of Object.entries(json as Record<string, unknown>)) {
    const length = Number(lengthKey);
    const pieces = Number(rawCount);
    if (!Number.isFinite(length) || !Number.isFinite(pieces)) continue;
    if (length <= 0 || pieces <= 0) continue;
    count += pieces;
    meters += length * pieces;
  }
  return { count, meters };
}

/** Σ(beamCount × beamLength) across an order's rooms. The owner's formula. */
export function roomBeamMeters(rooms: Array<{ beamCount: number; beamLength: number }>): number {
  return rooms.reduce((sum, r) => sum + r.beamCount * r.beamLength, 0);
}

/**
 * Split one order's area across the trucks that carried it.
 *
 * The owner's rule is that an order's m² is the figure already shown in its m²
 * column, so the shares MUST add back up to exactly `orderArea` — no truck
 * invents area and none is lost. Shipments record beams and blocks but never
 * area, so the split is by each truck's share of the blocks loaded.
 *
 * The denominator is the loaded shipments themselves, NOT `Order.totalBlocks`:
 * on prod, 24 of 65 fully-loaded orders shipped a different block count than
 * they ordered (real over/under-loading). Dividing by the ordered count would
 * make those orders' areas fail to sum to their own m² cell, breaking the rule.
 *
 * Falls back to beam metres when an order carries no blocks (a beams-only
 * load), and to an even split when a truck records neither — otherwise a
 * zero denominator would drop the order's area entirely.
 *
 * NOTE: for a PARTIALLY loaded order (some trucks still pending) the shares
 * still total the full order area, because an unloaded shipment records no
 * quantities at all and so offers nothing to prorate against. One order is in
 * this state on prod today.
 */
export function areaShares(
  orderArea: number,
  loaded: Array<{ blocks: number; meters: number }>,
): number[] {
  if (loaded.length === 0) return [];
  if (loaded.length === 1) return [orderArea];

  const totalBlocks = loaded.reduce((s, l) => s + l.blocks, 0);
  if (totalBlocks > 0) return loaded.map((l) => (orderArea * l.blocks) / totalBlocks);

  const totalMeters = loaded.reduce((s, l) => s + l.meters, 0);
  if (totalMeters > 0) return loaded.map((l) => (orderArea * l.meters) / totalMeters);

  return loaded.map(() => orderArea / loaded.length);
}

/** Minimum an order must expose for `physicalCompletion` to judge it. */
export interface CompletionInput {
  status: string;
  deliveredAt?: Date | null;
  loadedAt?: Date | null;
  scheduledAt: Date;
  shipments: Array<{ status: string; deliveredAt?: Date | null }>;
}

/**
 * When the goods physically left the yard in full — or null if they have not.
 *
 * NOT the same as `status === 'DELIVERED'`. An order cannot reach that status
 * until its balance is zero (`PATCH /api/orders/[id]` gates it, and the UI
 * disables the button), so a split-shipment order whose every truck has been
 * delivered but which is still unpaid stays at DISPATCHED forever. On prod
 * that is three orders holding 1 653 blocks that never counted anywhere.
 *
 * Delivery and payment are different facts. Volume follows the goods:
 *  - the order is marked DELIVERED — the single-truck path, gated on payment; or
 *  - it has shipments and EVERY one of them is DELIVERED, whatever the balance.
 *
 * The returned date is when that completion happened, used to pick the month.
 * Falls back through `loadedAt` to `scheduledAt` so a missing timestamp on an
 * old row can never drop the volume entirely.
 */
export function physicalCompletion(order: CompletionInput): Date | null {
  if (order.status === 'DELIVERED') {
    return order.deliveredAt ?? order.loadedAt ?? order.scheduledAt;
  }
  if (order.shipments.length > 0 && order.shipments.every((s) => s.status === 'DELIVERED')) {
    // The LAST truck is when the order became whole.
    const dates = order.shipments
      .map((s) => s.deliveredAt)
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime());
    return dates[0] ?? order.loadedAt ?? order.scheduledAt;
  }
  return null;
}

/**
 * What a fully-delivered order still owes the tally.
 *
 * Loading paperwork is routinely incomplete: an operator photographs the first
 * truck and forgets the rest, and filler blocks are not required to be
 * photographed at all the way T-beams are. So the recorded shipments of a
 * delivered order can add up to less than the order — on prod, 215 orders are
 * DELIVERED but only 159 carry any loading record.
 *
 * Once an order reaches DELIVERED the whole order demonstrably left the yard,
 * so the difference is credited as one remainder event. Taking the DIFFERENCE
 * rather than replacing the recorded figures is what keeps this from
 * double-counting: months that do have accurate truck records keep them, and
 * only the unrecorded balance is added.
 *
 * Clamped at zero per dimension — an order deliberately over-loaded (24 orders
 * on prod shipped more blocks than ordered) has nothing outstanding, and must
 * never be clawed back to the ordered quantity.
 */
export function remainderAfterRecorded(
  orderTotals: { blocks: number; beamCount: number; beamMeters: number; area: number },
  recorded: { blocks: number; beamCount: number; beamMeters: number; area: number },
): { blocks: number; beamCount: number; beamMeters: number; area: number } {
  return {
    blocks: Math.max(0, orderTotals.blocks - recorded.blocks),
    beamCount: Math.max(0, orderTotals.beamCount - recorded.beamCount),
    beamMeters: Math.max(0, orderTotals.beamMeters - recorded.beamMeters),
    area: Math.max(0, orderTotals.area - recorded.area),
  };
}

/** True when any dimension of a remainder is worth recording. */
export function hasRemainder(r: {
  blocks: number;
  beamCount: number;
  beamMeters: number;
  area: number;
}): boolean {
  return r.blocks > 0 || r.beamCount > 0 || r.beamMeters > 0.0001 || r.area > 0.0001;
}

/**
 * Bucket loading events by month.
 *
 * `orderCount` counts DISTINCT orders, so an order split across three trucks in
 * the same month counts once — the owner reads it as "orders loaded", not
 * "trucks loaded". An order whose trucks straddle a month boundary (5 such
 * orders on prod) is counted in each month it actually loaded into, which is
 * correct: it did contribute volume to both.
 */
export function accumulateLoaded(events: LoadEvent[]): Map<string, LoadedVolume> {
  const byMonth = new Map<string, LoadedVolume>();
  const seen = new Map<string, Set<string>>();

  for (const e of events) {
    let v = byMonth.get(e.monthKey);
    if (!v) {
      v = emptyVolume();
      byMonth.set(e.monthKey, v);
      seen.set(e.monthKey, new Set());
    }
    v.blocks += e.blocks;
    v.beamCount += e.beamCount;
    v.beamMeters += e.beamMeters;
    v.area += e.area;

    const ids = seen.get(e.monthKey)!;
    if (!ids.has(e.orderId)) {
      ids.add(e.orderId);
      v.orderCount += 1;
    }
  }
  return byMonth;
}
