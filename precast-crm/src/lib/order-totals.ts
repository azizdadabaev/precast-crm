// Pure order-total math — the price-integrity core of order placement.
//
// Extracted verbatim from the inline POST /api/orders handler so the same
// numbers are produced whether an order is placed by the human UI (the route)
// or, later, by the AI-agent approval path (createOrder, called session-free).
// No Prisma, no Date, no env — `pricing` is injected so this stays a pure,
// exhaustively-testable function.

import {
  calculateSlab,
  type Pattern,
  type PriceConfig,
  type SlabResult,
} from "@/services/calculation-engine";
import { calcResultToCreatePayload, type RoomInput } from "@/lib/calc-persistence";

/** One room + the engine result it produced — threaded into persistence. */
export interface ComputedRoom {
  input: RoomInput;
  result: SlabResult;
}

export interface OrderTotals {
  computed: ComputedRoom[];
  roomsSubtotal: number; // Σ per-room subtotal, honoring per-row rate overrides
  totalArea: number; // Σ monolith_area
  totalBlocks: number; // Σ total_blocks
  totalBeams: number; // Σ beam_count
  discountAmount: number;
  resolvedDiscountPercent: number;
  totalPrice: number; // roomsSubtotal − discountAmount + deliveryCost + otherCost
}

export interface OrderTotalsOptions {
  discountPercent: number;
  discountAmount: number;
  deliveryCost: number;
  otherCost: number;
}

/**
 * Compute every room and roll up the order totals + resolved discount.
 *
 * Pricing rules (identical to the pre-extraction route handler):
 * - `roomsSubtotal` sums each room's `calcResultToCreatePayload(...).subtotal`
 *   so per-row catalog-tier rate overrides are reflected (the engine's bare
 *   `result.subtotal` would ignore them).
 * - Discount has two mutually-exclusive modes resolved by precedence:
 *   `discountAmount > 0` wins (capped at `roomsSubtotal`; the persisted
 *   percent is back-computed); otherwise the percentage is applied. A zero
 *   `roomsSubtotal` can never divide-by-zero (percent stays 0).
 *
 * Throws `CalculationError` (from `calculateSlab`) on invalid room input — the
 * caller surfaces that rather than guessing.
 */
export function computeOrderTotals(
  rooms: RoomInput[],
  opts: OrderTotalsOptions,
  pricing: PriceConfig,
): OrderTotals {
  const computed: ComputedRoom[] = rooms.map((room) => ({
    input: room,
    result: calculateSlab(
      {
        inner_width: room.innerWidth,
        inner_length: room.innerLength,
        bearing: room.bearing,
        correction: room.correction,
        extra_beams: room.extraBeams,
        force_start_beam: room.forceStartBeam,
        pattern: (room.patternOverride ?? undefined) as Pattern | undefined,
      },
      pricing,
    ),
  }));

  const roomsSubtotal = computed.reduce(
    (s, c) => s + Number(calcResultToCreatePayload(c.input, c.result).subtotal),
    0,
  );
  const totalArea = computed.reduce((s, c) => s + c.result.monolith_area, 0);
  const totalBlocks = computed.reduce((s, c) => s + c.result.total_blocks, 0);
  const totalBeams = computed.reduce((s, c) => s + c.result.beam_count, 0);

  let discountAmount: number;
  let resolvedDiscountPercent: number;
  if (opts.discountAmount > 0) {
    discountAmount = Math.min(opts.discountAmount, roomsSubtotal);
    resolvedDiscountPercent =
      roomsSubtotal > 0
        ? Math.round((discountAmount / roomsSubtotal) * 10000) / 100
        : 0;
  } else {
    resolvedDiscountPercent = opts.discountPercent;
    discountAmount = roomsSubtotal * (resolvedDiscountPercent / 100);
  }

  const totalPrice =
    roomsSubtotal - discountAmount + opts.deliveryCost + opts.otherCost;

  return {
    computed,
    roomsSubtotal,
    totalArea,
    totalBlocks,
    totalBeams,
    discountAmount,
    resolvedDiscountPercent,
    totalPrice,
  };
}
