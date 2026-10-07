// Floor (beam-and-block) quote for the MCP server (spec 2026-10-07).
//
// Pure. Every number comes from the CRM's own code path for real orders and the
// Telegram agent: withAgentPatternPolicy (never Г-Б-Г) → computeOrderTotals →
// calcResultToCreatePayload (the exact row a draft stores). Nothing here
// re-derives a price.

import type { PriceConfig } from '@/services/calculation-engine';
import type { RoomInput } from '@/lib/calc-persistence';
import { calcResultToCreatePayload } from '@/lib/calc-persistence';
import { computeOrderTotals } from '@/lib/order-totals';
import { withAgentPatternPolicy } from '@/lib/agent/pattern-policy';
import { FLOOR_KG_PER_M2, MAX_BEAM_LENGTH_M } from '@/lib/agent/tools/get-quote';
import { textsFor, type Lang } from './texts';

export type QuoteErrorCode =
  | 'INVALID_INPUT'
  | 'WIDTH_OUT_OF_RANGE'
  | 'LENGTH_OUT_OF_RANGE'
  | 'TOO_MANY_ROOMS'
  | 'UNKNOWN_SIZE'
  | 'QUOTE_NOT_FOUND'
  | 'QUOTE_SUPERSEDED'
  | 'QUOTE_WITHDRAWN'
  | 'QUOTE_CHANGED'
  | 'NOT_AVAILABLE'
  | 'RATE_LIMITED'
  | 'PRICING_UNAVAILABLE';

/** A refused request: the whole call fails with this code and message. */
export class QuoteInputError extends Error {
  constructor(public code: QuoteErrorCode, message: string) {
    super(message);
    this.name = 'QuoteInputError';
  }
}

export const MAX_ROOMS = 20;
/** Never below the standard: a smaller bearing lowers the price and can slip a
 *  beam under the 6.30 m limit. Larger is fine (it only lengthens the beam). */
export const MIN_BEARING_CM = 15;
export const MAX_BEARING_CM = 30;
export const MAX_WIDTH_M = 12;
export const MAX_LENGTH_M = 50;
/** One mid-span prop above this beam length (owner's product facts). */
export const PROP_ABOVE_M = 5.3;

/** Prestressed strands per beam by length: 4 up to 4.30, 5 up to 5.30, 6 up to 6.30. */
export function strandsPerBeam(beamLength: number): number | null {
  if (beamLength <= 4.3 + 1e-9) return 4;
  if (beamLength <= 5.3 + 1e-9) return 5;
  if (beamLength <= MAX_BEAM_LENGTH_M + 1e-9) return 6;
  return null;
}

export function needsProp(beamLength: number): boolean {
  return beamLength > PROP_ABOVE_M + 1e-9;
}

export interface SlabQuoteInput {
  rooms: Array<{ name?: string; width_m: number; length_m: number }>;
  bearing_cm?: number;
  orientation?: 'auto' | 'as_given';
  lang?: Lang;
}

export interface QuotedRoom {
  name: string;
  status: 'priced' | 'needs_manual_review';
  reason?: 'span_over_6_30';
  width_m: number;
  length_m: number;
  orientation: 'auto' | 'as_given';
  beams_span: 'short_side' | 'long_side';
  span_m: number;
  beam_length_m: number;
  area_m2?: number;
  billed_area_m2?: number;
  beam_count?: number;
  block_rows?: number;
  block_count?: number;
  closing_piece?: 'none' | 'beam' | 'block_row';
  closing_piece_price?: number;
  strands_per_beam?: number | null;
  needs_prop?: boolean;
  price_per_m2?: number;
  subtotal?: number;
}

export interface SlabQuoteResult {
  lang: Lang;
  rooms: QuotedRoom[];
  /** Draft rows for the priced rooms, in room order (`seq` set). */
  calcs: Array<ReturnType<typeof calcResultToCreatePayload> & { seq: number }>;
  totals: {
    area_m2: number;
    beam_count: number;
    block_count: number;
    total_weight_kg: number;
    total_price: number;
    currency: 'UZS';
  };
  includes: string;
  excludes: string[];
  warnings: string[];
}

const NO_EXTRAS = { discountPercent: 0, discountAmount: 0, deliveryCost: 0, otherCost: 0 };
const r2 = (n: number) => Math.round(n * 100) / 100;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function validate(input: SlabQuoteInput, orientation: 'auto' | 'as_given'): void {
  const rooms = Array.isArray(input?.rooms) ? input.rooms : [];
  if (rooms.length === 0) throw new QuoteInputError('INVALID_INPUT', 'At least one room is required.');
  if (rooms.length > MAX_ROOMS) {
    throw new QuoteInputError('TOO_MANY_ROOMS', `At most ${MAX_ROOMS} rooms per quote.`);
  }
  if (
    input.bearing_cm !== undefined &&
    (!finite(input.bearing_cm) || input.bearing_cm < MIN_BEARING_CM || input.bearing_cm > MAX_BEARING_CM)
  ) {
    throw new QuoteInputError(
      'INVALID_INPUT',
      `bearing_cm must be between ${MIN_BEARING_CM} and ${MAX_BEARING_CM} (15 is standard; a smaller bearing needs staff).`,
    );
  }
  rooms.forEach((r, i) => {
    const label = r?.name?.trim() || `room ${i + 1}`;
    if (!finite(r?.width_m) || !finite(r?.length_m) || r.width_m <= 0 || r.length_m <= 0) {
      throw new QuoteInputError('INVALID_INPUT', `${label}: width_m and length_m must be positive numbers in metres.`);
    }
    // In auto mode the sides are just "two walls": check the span (shorter) and
    // the run (longer), so 13 × 5 prices exactly like 5 × 13.
    const span = orientation === 'auto' ? Math.min(r.width_m, r.length_m) : r.width_m;
    const run = orientation === 'auto' ? Math.max(r.width_m, r.length_m) : r.length_m;
    if (span > MAX_WIDTH_M) {
      throw new QuoteInputError('WIDTH_OUT_OF_RANGE', `${label}: beam span ${span} m is over ${MAX_WIDTH_M} m.`);
    }
    if (run > MAX_LENGTH_M) {
      throw new QuoteInputError('LENGTH_OUT_OF_RANGE', `${label}: length ${run} m is over ${MAX_LENGTH_M} m.`);
    }
  });
}

/** Which wall the beams span. auto = the shorter one (owner 2026-10-07). */
function orient(width: number, length: number, orientation: 'auto' | 'as_given') {
  const span = orientation === 'as_given' ? width : Math.min(width, length);
  const run = orientation === 'as_given' ? length : Math.max(width, length);
  const beams_span: 'short_side' | 'long_side' = span <= run ? 'short_side' : 'long_side';
  return { span, run, beams_span };
}

export function buildSlabQuote(input: SlabQuoteInput, pricing: PriceConfig): SlabQuoteResult {
  const orientation: 'auto' | 'as_given' = input.orientation === 'as_given' ? 'as_given' : 'auto';
  validate(input, orientation);
  const { lang, t } = textsFor(input.lang);
  const bearing = (input.bearing_cm ?? 15) / 100;
  const warnings: string[] = [];

  // Shape every room; rooms the factory cannot build are flagged, not priced.
  const shaped = input.rooms.map((r, i) => {
    const name = r.name?.trim() || t.roomName(i + 1);
    const o = orient(r.width_m, r.length_m, orientation);
    const beamLength = Math.round((o.span + 2 * bearing) * 1000) / 1000;
    const base = {
      name, width_m: r.width_m, length_m: r.length_m, orientation,
      beams_span: o.beams_span, span_m: o.span, beam_length_m: beamLength,
    };
    if (beamLength > MAX_BEAM_LENGTH_M + 1e-9) {
      warnings.push(t.spanOver630(name, beamLength));
      return { base, room: null as RoomInput | null };
    }
    if (o.beams_span === 'long_side') warnings.push(t.longSide(name));
    return {
      base,
      room: withAgentPatternPolicy({ name, innerWidth: o.span, innerLength: o.run, bearing }),
    };
  });

  const priced = shaped.filter((s) => s.room).map((s) => s.room as RoomInput);
  const totals = priced.length ? computeOrderTotals(priced, NO_EXTRAS, pricing) : null;
  const calcs = (totals?.computed ?? []).map((c, i) => ({ ...calcResultToCreatePayload(c.input, c.result), seq: i }));

  let k = 0;
  const rooms: QuotedRoom[] = shaped.map((s) => {
    if (!s.room) return { ...s.base, status: 'needs_manual_review', reason: 'span_over_6_30' };
    const c = calcs[k++];
    const pattern = String(c.pattern);
    return {
      ...s.base,
      status: 'priced',
      beam_length_m: Number(c.beamLength),
      area_m2: r2(Number(c.monolithArea)),
      billed_area_m2: r2(Number(c.billedArea)),
      beam_count: Number(c.beamCount),
      block_rows: Number(c.blockRows),
      block_count: Number(c.totalBlocks),
      closing_piece: pattern === 'BGB' ? 'beam' : pattern === 'GBG' ? 'block_row' : 'none',
      closing_piece_price: Math.round(Number(c.patternExtraCost)),
      strands_per_beam: strandsPerBeam(Number(c.beamLength)),
      needs_prop: needsProp(Number(c.beamLength)),
      price_per_m2: Math.round(Number(c.m2Price)),
      subtotal: Math.round(Number(c.subtotal)),
    };
  });
  if (priced.length === 0) warnings.push(t.nothingPriced);

  const monolith = calcs.reduce((s, c) => s + Number(c.monolithArea), 0);
  return {
    lang,
    rooms,
    calcs,
    totals: {
      area_m2: r2(monolith),
      beam_count: calcs.reduce((s, c) => s + Number(c.beamCount), 0),
      block_count: calcs.reduce((s, c) => s + Number(c.totalBlocks), 0),
      total_weight_kg: Math.round(monolith * FLOOR_KG_PER_M2),
      total_price: Math.round(totals?.totalPrice ?? 0),
      currency: 'UZS',
    },
    includes: t.slabIncludes,
    excludes: t.slabExcludes,
    warnings,
  };
}
