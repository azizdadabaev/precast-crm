/**
 * ─────────────────────────────────────────────────────────────────
 *  PRECAST BEAM-AND-BLOCK CALCULATION ENGINE
 * ─────────────────────────────────────────────────────────────────
 *
 *  Pure module. NO database access. NO side effects.
 *  All inputs come in via arguments; all results are returned.
 *  This makes the engine 100% testable and reusable.
 *
 *  Algorithm (remainder-based, replaces the legacy Excel "tolerance"
 *  rule with a cleaner threshold model):
 *
 *    1. beam_length     = width + 2 * BEARING
 *    2. rows_initial    = floor(length / BEAM_SPACING)
 *       remainder       = length - rows_initial * BEAM_SPACING
 *    3. Apply the remainder rule:
 *         remainder = 0                           → exact fit
 *         remainder ≥ FILLER_THRESHOLD            → +1 filler row only
 *         remainder < FILLER_THRESHOLD (and > 0)  → +1 row AND +1 beam
 *    4. Add manual extras (engineer overrides).
 *    5. actual_length   = rows_final * BEAM_SPACING - EDGE_OFFSET
 *    6. blocks_per_row  = ceil((beam_length - BLOCK_EDGE_LOSS) / BLOCK_LENGTH)
 *    7. total_blocks    = blocks_per_row * rows_final
 *    8. concrete_volume = width * actual_length * TOPPING_THICKNESS
 *
 *  All decimal results are kept at 3-digit precision via `round3`.
 * ─────────────────────────────────────────────────────────────────
 */

// ── Types ───────────────────────────────────────────────────────

export interface CalculationConstants {
  BEAM_SPACING: number;       // 0.58 m  – pitch between beams
  BEARING: number;            // 0.15 m  – beam rests on each wall
  EDGE_OFFSET: number;        // 0.035 m – edge offset
  BLOCK_LENGTH: number;       // 0.20 m  – nominal filler block length
  BLOCK_EDGE_LOSS: number;    // 0.20 m  – removed from beam_length before block fit
  TOLERANCE: number;          // 0.05 m  – kept for back-compat (unused by new rule)
  FILLER_THRESHOLD: number;   // 0.20 m  – remainder ≥ this → filler-only row
  TOPPING_THICKNESS: number;  // m       – concrete topping thickness
}

export const DEFAULT_CONSTANTS: CalculationConstants = {
  BEAM_SPACING: 0.58,
  BEARING: 0.15,
  EDGE_OFFSET: 0.035,
  BLOCK_LENGTH: 0.20,
  BLOCK_EDGE_LOSS: 0.20,
  TOLERANCE: 0.05,
  FILLER_THRESHOLD: 0.20,
  TOPPING_THICKNESS: 0.05,
};

export interface SlabInput {
  /** Slab width in meters (perpendicular to beams). */
  width: number;
  /** Slab length in meters (parallel to beams). */
  length: number;
}

export interface BeamGroup {
  length: number;
  qty: number;
}

export interface SlabResult {
  beam_length: number;
  rows_initial: number;
  rows_final: number;
  beam_count: number;
  beam_groups: BeamGroup[];
  blocks_per_row: number;
  total_blocks: number;
  actual_length: number;
  corrected_length: number;
  covered_area: number;
  m2_area: number;
  extra_beams_qty: number;
  extra_beam_price_per_m: number;
  delta: number;
  concrete_volume: number;
  weights: {
    beams_kg: number;
    blocks_kg: number;
    total_kg: number;
  };
  constants: CalculationConstants;
}

// ── Helpers ─────────────────────────────────────────────────────

/** Round half-away-from-zero to 3 decimal places (avoids JS banker's rounding). */
export function round3(n: number): number {
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(n) * 1000)) / 1000;
}

export function round2(n: number): number {
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(n) * 100)) / 100;
}

// ── Validation ──────────────────────────────────────────────────

export class CalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalculationError";
  }
}

function validateInput(input: SlabInput, c: CalculationConstants): void {
  if (!Number.isFinite(input.width) || input.width <= 0) {
    throw new CalculationError("width must be a positive finite number (meters)");
  }
  if (!Number.isFinite(input.length) || input.length <= 0) {
    throw new CalculationError("length must be a positive finite number (meters)");
  }
  if (c.BEAM_SPACING <= 0) throw new CalculationError("BEAM_SPACING must be > 0");
  if (c.BLOCK_LENGTH <= 0) throw new CalculationError("BLOCK_LENGTH must be > 0");
}

// ── Main calculation ────────────────────────────────────────────

/**
 * Calculate beam-and-block layout for a single rectangular slab.
 *
 * @param input      slab geometry (width × length, meters)
 * @param overrides  optional constants overrides (admin-tunable)
 * @param manual     extra beams / fillers added by the engineer
 */
export function calculateSlab(
  input: SlabInput,
  overrides: Partial<CalculationConstants> = {},
  manual: { extraBeams?: number; extraFillers?: number } = {},
): SlabResult {
  const c: CalculationConstants = { ...DEFAULT_CONSTANTS, ...overrides };
  validateInput(input, c);

  const { width, length } = input;
  const extraBeams = manual.extraBeams ?? 0;
  const extraFillers = manual.extraFillers ?? 0;

  // 1. Beam length = inner width + bearing on both ends
  const beam_length = round3(width + 2 * c.BEARING);

  // 2. Whole beam-spacing intervals plus the leftover length
  const rows_initial = Math.floor(length / c.BEAM_SPACING);
  const remainder = round3(length - rows_initial * c.BEAM_SPACING);

  // 3. Remainder rule
  let autoFillers = 0;
  let autoExtraBeams = 0;
  if (remainder > 0) {
    autoFillers = 1;
    if (remainder < c.FILLER_THRESHOLD) {
      // remainder too small for a proper filler — add a beam too
      autoExtraBeams = 1;
    }
  }

  // 4. Final counts (auto + manual)
  const rows_final = rows_initial + autoFillers + extraFillers;
  const beam_count = rows_initial + autoExtraBeams + extraBeams;

  // 5. Geometry
  const actual_length = round3(rows_final * c.BEAM_SPACING - c.EDGE_OFFSET);
  const corrected_length = actual_length;
  const delta = round3(actual_length - length);

  // 6. Block packing
  const blocks_per_row = Math.ceil((beam_length - c.BLOCK_EDGE_LOSS) / c.BLOCK_LENGTH);
  const total_blocks = blocks_per_row * rows_final;

  // 7. Concrete topping volume — poured area × thickness
  const concrete_volume = round3(width * actual_length * c.TOPPING_THICKNESS);

  // 8. UI helpers (not part of the core algorithm but used by the calculator UI)
  const covered_area = round3(width * actual_length);
  const m2_area = round3(rows_final * c.BEAM_SPACING * beam_length);
  const extra_beams_qty = extraBeams;
  const extra_beam_price_per_m =
    beam_length <= 4.30 ? 60 :
    beam_length <= 5.30 ? 70 :
    beam_length <= 6.30 ? 80 : 90;

  const beam_groups: BeamGroup[] = [{ length: beam_length, qty: beam_count }];

  return {
    beam_length,
    rows_initial,
    rows_final,
    beam_count,
    beam_groups,
    blocks_per_row,
    total_blocks,
    actual_length,
    corrected_length,
    covered_area,
    m2_area,
    extra_beams_qty,
    extra_beam_price_per_m,
    delta,
    concrete_volume,
    weights: {
      beams_kg: round3(beam_count * beam_length * 15), // 15 kg per linear meter of beam
      blocks_kg: round3(total_blocks * 16),            // 16 kg per block
      total_kg: round3(beam_count * beam_length * 15 + total_blocks * 16),
    },
    constants: c,
  };
}

// ── Trapezoidal / irregular shapes ──────────────────────────────

export interface MultiSpanInput {
  /** Length of slab (along which rows are counted). */
  length: number;
  /**
   * One width per "band". For trapezoidal shapes pass [topWidth, bottomWidth];
   * for irregular shapes pass several segments. Each band produces its own
   * beam group sized to the band's width.
   */
  widths: number[];
}

/**
 * Apply beam grouping rules from the spec for variable-width slabs.
 * Width difference between min and max determines how many distinct
 * beam-length groups are produced (≤0.25 → 1, ≤0.50 → 2, ≤0.80 → 3, else 4).
 *
 * The row count and block math reuse the rectangular pipeline applied to
 * the widest band so the slab is fully covered.
 */
export function calculateMultiSpan(
  input: MultiSpanInput,
  overrides: Partial<CalculationConstants> = {},
): SlabResult {
  const c: CalculationConstants = { ...DEFAULT_CONSTANTS, ...overrides };
  if (!input.widths.length) {
    throw new CalculationError("widths[] must contain at least one value");
  }

  const minW = Math.min(...input.widths);
  const maxW = Math.max(...input.widths);
  const span = maxW - minW;

  let groupCount: number;
  if (span <= 0.25) groupCount = 1;
  else if (span <= 0.5) groupCount = 2;
  else if (span <= 0.8) groupCount = 3;
  else groupCount = 4;

  // Run the standard pipeline against the widest band to ensure full coverage.
  const base = calculateSlab({ width: maxW, length: input.length }, overrides);

  // Distribute total beam_count across the requested groups.
  const groups: BeamGroup[] = [];
  const perGroup = Math.floor(base.beam_count / groupCount);
  let leftover = base.beam_count - perGroup * groupCount;

  for (let i = 0; i < groupCount; i++) {
    const t = groupCount === 1 ? 0 : i / (groupCount - 1);
    const widthAt = minW + (maxW - minW) * t;
    const beamLen = round3(widthAt + 2 * c.BEARING);
    const qty = perGroup + (leftover > 0 ? 1 : 0);
    if (leftover > 0) leftover--;
    groups.push({ length: beamLen, qty });
  }

  return { ...base, beam_groups: groups };
}
