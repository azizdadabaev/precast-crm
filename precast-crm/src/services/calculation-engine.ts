/**
 * ─────────────────────────────────────────────────────────────────
 *  PRECAST BEAM-AND-BLOCK CALCULATION ENGINE — v2
 * ─────────────────────────────────────────────────────────────────
 *
 *  Pure module. NO database access. NO side effects.
 *
 *  Three layout patterns (Шаблон):
 *    Г-Б   "GB"   alternating, equal beam and block-row counts
 *    Б-Г-Б "BGB"  extra closing beam (no extra block row)
 *    Г-Б-Г "GBG"  extra closing block row (sits half on previous beam, half on wall)
 *
 *  Pipeline:
 *    effective_length = inner_length + correction
 *    pitches  = FLOOR(effective_length / PITCH)
 *    R        = effective_length - pitches * PITCH
 *    pattern auto-pick:
 *      R = 0           → GB at `pitches`
 *      R ≤ 0.20        → BGB at `pitches`     (+1 beam, +0.12 m visual)
 *      R ≤ 0.45        → GBG at `pitches`     (+1 block row, +0.45 m visual)
 *      R > 0.45        → GB  at `pitches + 1` (round up; over-covers)
 *    User can override the pattern (no pitch bump).
 *
 *  "Add a starting beam" — sourced from either force_start_beam (StartB toggle)
 *  or the first manual extra beam (+B column). Pattern-aware effect:
 *    Г-Б   + start → Б-Г-Б at same pitches  (closing beam added)
 *    Г-Б-Г + start → Г-Б at pitches+1       (the existing extra block row is
 *                                             balanced by the new beam, so the
 *                                             whole slab is now alternating
 *                                             N+1 beams ↔ N+1 blocks; billed
 *                                             as a normal Г-Б, no separate
 *                                             pattern-extra line item)
 *    Б-Г-Б + start → no-op (already starts with a beam)
 *  Whichever source supplied the start beam is "consumed" by the promotion;
 *  any additional manual extras remain as per-meter line items on top.
 *
 *  Length concepts (three of them, each with a clear job):
 *    billed_length   = pitches × PITCH                                  ← m²-rate base
 *    slab_length     = billed_length + pattern_extension                ← physical slab
 *    monolith_length = slab_length + effective_extras × BEAM_WIDTH      ← what UI shows
 *
 *  `effective_extras` may be lower than the user-input `extra_beams` when one
 *  was absorbed by the GBG→GB conversion. Pricing fields (m2_cost,
 *  pattern_extra_cost, manual_extra_beams_cost, subtotal) all reflect the
 *  POST-conversion state.
 * ─────────────────────────────────────────────────────────────────
 */

// ── Physical constants (from the user's factory; not user-tunable) ──

export const PITCH = 0.58;            // beam center-to-center spacing
export const BEAM_WIDTH = 0.12;       // beam width along the length axis
export const BLOCK_LENGTH = 0.20;     // block length along the beam axis
export const BLOCK_VISIBLE = 0.45;    // visible block width (perpendicular to beam, between two beams)
export const TOPPING_THICKNESS = 0.05;
export const DEFAULT_BEARING = 0.15;

// Auto-pick thresholds on the post-correction remainder R
export const SMALL_REMAINDER = 0.20;  // R ≤ this → BGB (extra beam)
export const MEDIUM_REMAINDER = 0.45; // R ≤ this → GBG (extra block); else extra pair (GB at N+1)

// ── Pricing tables (UZS) ────────────────────────────────────────

interface PriceTier {
  max_beam_length: number;
  price: number;
}

export const M2_PRICE_TIERS: readonly PriceTier[] = [
  { max_beam_length: 4.30, price: 140_000 },
  { max_beam_length: 5.30, price: 160_000 },
  { max_beam_length: 6.30, price: 180_000 },
  { max_beam_length: 7.30, price: 200_000 },
  { max_beam_length: 8.30, price: 230_000 },
] as const;

export const EXTRA_BEAM_PRICE_TIERS: readonly PriceTier[] = [
  { max_beam_length: 4.30, price: 60_000 },
  { max_beam_length: 5.30, price: 70_000 },
  { max_beam_length: 6.30, price: 80_000 },
  { max_beam_length: 7.30, price: 100_000 },
  { max_beam_length: 8.30, price: 120_000 },
] as const;

export const BLOCK_UNIT_PRICE = 6_000;

// ── Types ───────────────────────────────────────────────────────

export type Pattern = "GB" | "BGB" | "GBG";

export interface SlabInput {
  /** Inside-wall to inside-wall, perpendicular to beams (m). */
  inner_width: number;
  /** Inside-wall to inside-wall, parallel to beams (m). */
  inner_length: number;
  /** How far the beam sits onto the wall on each side (m). Default 0.15. */
  bearing?: number;
  /** Explicit pattern override; omit to use auto-pick. */
  pattern?: Pattern;
  /** Length adjustment applied before pitch math. Default 0. */
  correction?: number;
  /** Manual extra beams (charged per linear meter at the extra-beam tier). Default 0. */
  extra_beams?: number;
  /**
   * Force a "starting beam" — promotes auto-picked GB to BGB by adding one beam.
   * Has no effect on BGB/GBG. (Excel column "Боши балка булиши шарт".)
   */
  force_start_beam?: boolean;
}

export interface SlabResult {
  // Echoed inputs
  inner_width: number;
  inner_length: number;
  bearing: number;
  correction: number;
  extra_beams: number;
  force_start_beam: boolean;

  // Pitch math
  effective_length: number;     // inner_length + correction
  pitches: number;              // N — full PITCH spans actually used
  remainder: number;            // R after `pitches` (informational)
  pattern: Pattern;             // chosen pattern (after override + force_start_beam)
  pattern_auto: Pattern;        // what auto-pick chose, before any override

  // Geometry
  beam_length: number;          // inner_width + 2 × bearing
  blocks_per_row: number;       // CEIL(inner_width / BLOCK_LENGTH)
  beam_count: number;           // includes pattern's extra beam AND manual extras
  block_rows: number;           // includes pattern's extra block row
  total_blocks: number;         // blocks_per_row × block_rows

  // Lengths (m)
  monolith_length: number;      // physical span actually built
  billed_length: number;        // pitches × PITCH — the length used for m² billing

  // Areas (m²)
  monolith_area: number;        // beam_length × monolith_length
  billed_area: number;          // beam_length × billed_length — what m²-rate is applied to

  // Concrete topping volume (m³)
  concrete_volume: number;

  // Pricing
  m2_price: number;             // UZS / m²  (0 in extras-only mode — no m² billing)
  extra_beam_price_per_m: number;
  m2_cost: number;              // billed_area × m2_price (0 in extras-only mode)
  pattern_extra_cost: number;   // 0 | 1 extra beam | blocks_per_row × BLOCK_UNIT_PRICE
  manual_extra_beams_cost: number;
  subtotal: number;             // m2_cost + pattern_extra_cost + manual_extra_beams_cost

  /**
   * True when the row is in "extras-only mode" — `inner_length=0` AND
   * `extra_beams>=1`. In this mode there's no slab pattern, no pitch
   * math, no m² billing — just N extra beams charged at the per-meter
   * tier price. UI consumers should render pitches / blocks_per_row /
   * block_rows / total_blocks / m2_price as em-dashes when this is
   * true (the engine returns 0/sentinel values for those fields).
   *
   * False for every length>0 path (including length>0 + extras>0).
   */
  is_extras_only: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────

/** Round half-away-from-zero to N decimals (avoids JS banker's rounding). */
export function roundN(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(n) * f)) / f;
}
export const round3 = (n: number) => roundN(n, 3);
export const round2 = (n: number) => roundN(n, 2);

/** Pick the price for a beam length from a tier table; clamps above the last tier to its price. */
export function tierPrice(beam_length: number, tiers: readonly PriceTier[]): number {
  const eps = 1e-9;
  for (const t of tiers) {
    if (beam_length <= t.max_beam_length + eps) return t.price;
  }
  return tiers[tiers.length - 1].price;
}

/** Auto-pick pattern from a post-correction remainder. Caller bumps `pitches` for the GB-at-N+1 case. */
export function autoPickPattern(remainder: number): { pattern: Pattern; bumpPitches: boolean } {
  if (remainder <= 1e-9) return { pattern: "GB", bumpPitches: false };
  if (remainder <= SMALL_REMAINDER + 1e-9) return { pattern: "BGB", bumpPitches: false };
  if (remainder <= MEDIUM_REMAINDER + 1e-9) return { pattern: "GBG", bumpPitches: false };
  return { pattern: "GB", bumpPitches: true };
}

// ── Validation ──────────────────────────────────────────────────

export class CalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalculationError";
  }
}

function validate(input: SlabInput, bearing: number): void {
  if (!Number.isFinite(input.inner_width) || input.inner_width <= 0) {
    throw new CalculationError("inner_width must be a positive finite number (meters)");
  }

  // length=0 is normally invalid, but is allowed in "extras-only mode":
  // operator wants to bill a few extra beams (reinforcing beams, edge
  // beams in a balcony, etc.) without a full room slab. Requires
  // extras>=1; without extras the row would have nothing to compute.
  const isExtrasOnlyMode =
    input.inner_length === 0 && (input.extra_beams ?? 0) >= 1;
  if (!isExtrasOnlyMode) {
    if (!Number.isFinite(input.inner_length) || input.inner_length <= 0) {
      throw new CalculationError("inner_length must be a positive finite number (meters)");
    }
  } else if (!Number.isFinite(input.inner_length)) {
    // Even in extras-only mode, NaN/Infinity for length is still wrong.
    throw new CalculationError("inner_length must be a finite number");
  }

  if (!Number.isFinite(bearing) || bearing < 0) {
    throw new CalculationError("bearing must be a non-negative finite number (meters)");
  }
  if (input.extra_beams !== undefined && (!Number.isInteger(input.extra_beams) || input.extra_beams < 0)) {
    throw new CalculationError("extra_beams must be a non-negative integer");
  }
}

// ── Main calculation ────────────────────────────────────────────

export function calculateSlab(input: SlabInput): SlabResult {
  const bearing = input.bearing ?? DEFAULT_BEARING;
  const correction = input.correction ?? 0;
  const extra_beams = input.extra_beams ?? 0;
  const force_start_beam = input.force_start_beam ?? false;

  validate(input, bearing);

  // Extras-only short-circuit. validate() already accepted the case;
  // the rest of calculateSlab assumes a real slab. See SlabResult's
  // is_extras_only doc for what UI / persistence should do.
  if (input.inner_length === 0 && extra_beams >= 1) {
    return calculateExtrasOnly(input, bearing, extra_beams);
  }

  // Geometry that doesn't depend on pattern
  const beam_length = round3(input.inner_width + 2 * bearing);
  const blocks_per_row = Math.ceil(input.inner_width / BLOCK_LENGTH);

  // Pitch math
  const effective_length = round3(input.inner_length + correction);
  let pitches = Math.floor(effective_length / PITCH);
  let remainder = round3(effective_length - pitches * PITCH);

  // Auto-pick on the floor-pitch remainder
  const auto = autoPickPattern(remainder);
  const pattern_auto = auto.pattern;

  // Choose final pattern: explicit override > force_start_beam > auto
  let pattern: Pattern;
  if (input.pattern) {
    pattern = input.pattern;
    // Explicit override never bumps pitches; user controls that via `correction`.
  } else if (auto.bumpPitches) {
    // Auto picked GB-at-N+1
    pitches += 1;
    remainder = 0;
    pattern = "GB";
  } else {
    pattern = pattern_auto;
  }

  // "Add a starting beam" — pattern-aware promotion. The start beam may come
  // from the StartB toggle (`force_start_beam`) OR the first manual extra (+B).
  // Whichever is consumed is what produces the conversion.
  let effective_extra_beams = extra_beams;
  if (pattern === "GBG" && (force_start_beam || effective_extra_beams >= 1)) {
    // Г-Б-Г + start beam → Г-Б at pitches+1 (the extra block row is balanced)
    pitches += 1;
    pattern = "GB";
    if (!force_start_beam) effective_extra_beams -= 1;
  } else if (pattern === "GB" && force_start_beam) {
    // Г-Б + start beam → Б-Г-Б at same pitches (closing beam added)
    pattern = "BGB";
  }
  // BGB + start beam: already starts with a beam → no-op

  // Pattern → counts and visual extension
  let beam_count_base: number;
  let block_rows: number;
  let extension: number;
  switch (pattern) {
    case "GB":
      beam_count_base = pitches;
      block_rows = pitches;
      extension = 0;
      break;
    case "BGB":
      beam_count_base = pitches + 1;
      block_rows = pitches;
      extension = BEAM_WIDTH;
      break;
    case "GBG":
      beam_count_base = pitches;
      block_rows = pitches + 1;
      extension = BLOCK_VISIBLE;
      break;
  }

  const beam_count = beam_count_base + effective_extra_beams;
  const total_blocks = blocks_per_row * block_rows;

  // Lengths — three concepts, see file header
  const billed_length = round3(pitches * PITCH);
  const slab_length = round3(pitches * PITCH + extension);
  const monolith_length = round3(slab_length + effective_extra_beams * BEAM_WIDTH);

  // Areas
  const billed_area = round3(beam_length * billed_length);
  const monolith_area = round3(beam_length * monolith_length);

  // Concrete topping volume — poured over the physically built slab
  // (does NOT include the visual extension from manual extra beams).
  const concrete_volume = round3(beam_length * slab_length * TOPPING_THICKNESS);

  // Pricing
  const m2_price = tierPrice(beam_length, M2_PRICE_TIERS);
  const extra_beam_price_per_m = tierPrice(beam_length, EXTRA_BEAM_PRICE_TIERS);
  const m2_cost = round2(billed_area * m2_price);
  const pattern_extra_cost =
    pattern === "BGB"
      ? round2(beam_length * extra_beam_price_per_m)
      : pattern === "GBG"
        ? round2(blocks_per_row * BLOCK_UNIT_PRICE)
        : 0;
  const manual_extra_beams_cost = round2(effective_extra_beams * beam_length * extra_beam_price_per_m);
  const subtotal = round2(m2_cost + pattern_extra_cost + manual_extra_beams_cost);

  return {
    inner_width: input.inner_width,
    inner_length: input.inner_length,
    bearing,
    correction,
    extra_beams,
    force_start_beam,
    effective_length,
    pitches,
    remainder,
    pattern,
    pattern_auto,
    beam_length,
    blocks_per_row,
    beam_count,
    block_rows,
    total_blocks,
    monolith_length,
    billed_length,
    monolith_area,
    billed_area,
    concrete_volume,
    m2_price,
    extra_beam_price_per_m,
    m2_cost,
    pattern_extra_cost,
    manual_extra_beams_cost,
    subtotal,
    is_extras_only: false,
  };
}

// ── Extras-only mode ───────────────────────────────────────────
//
// Operator entered width and a number of extra beams but NO length —
// they want N reinforcing/edge beams as their own line item, with no
// underlying slab. Engine produces a row that bills purely on the
// per-meter extra-beam tier; pattern/pitch/m² fields return 0 and the
// UI renders them as em-dashes. concrete_volume covers the actual
// physical footprint of the extras (width × N × BEAM_WIDTH × topping).

function calculateExtrasOnly(
  input: SlabInput,
  bearing: number,
  extra_beams: number,
): SlabResult {
  const beam_length = round3(input.inner_width + 2 * bearing);
  const slab_length = round3(extra_beams * BEAM_WIDTH);
  const slab_area = round3(input.inner_width * slab_length);

  const extra_beam_price_per_m = tierPrice(beam_length, EXTRA_BEAM_PRICE_TIERS);
  const extras_subtotal = round2(extra_beams * beam_length * extra_beam_price_per_m);

  return {
    inner_width: input.inner_width,
    inner_length: 0,
    bearing,
    correction: input.correction ?? 0,
    extra_beams,
    force_start_beam: input.force_start_beam ?? false,

    // No pitch math in extras-only mode.
    effective_length: 0,
    pitches: 0,
    remainder: 0,
    pattern: "GB",        // sentinel; UI ignores when is_extras_only
    pattern_auto: "GB",   // sentinel

    beam_length,
    blocks_per_row: 0,
    beam_count: extra_beams,
    block_rows: 0,
    total_blocks: 0,

    monolith_length: slab_length,   // = extras × 0.12
    billed_length: 0,               // m² billing not used

    monolith_area: slab_area,
    billed_area: 0,                 // m² billing not used

    concrete_volume: round3(input.inner_width * slab_length * TOPPING_THICKNESS),

    m2_price: 0,                    // sentinel: not applicable
    extra_beam_price_per_m,
    m2_cost: 0,                     // not used in extras-only
    pattern_extra_cost: 0,          // no pattern, no pattern extras
    manual_extra_beams_cost: extras_subtotal,
    subtotal: extras_subtotal,

    is_extras_only: true,
  };
}

// ── Project total (across rooms, with grand-total discount) ────

export interface ProjectTotal {
  rooms_subtotal: number;
  discount_percent: number;
  discount_amount: number;
  total: number;
}

export function projectTotal(rooms: SlabResult[], discount_percent = 0): ProjectTotal {
  const pct = Math.max(0, Math.min(100, discount_percent));
  const rooms_subtotal = round2(rooms.reduce((s, r) => s + r.subtotal, 0));
  const discount_amount = round2((rooms_subtotal * pct) / 100);
  const total = round2(rooms_subtotal - discount_amount);
  return { rooms_subtotal, discount_percent: pct, discount_amount, total };
}
