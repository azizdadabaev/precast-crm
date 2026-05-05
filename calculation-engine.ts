/**
 * ─────────────────────────────────────────────────────────────────
 *  PRECAST BEAM-AND-BLOCK CALCULATION ENGINE
 * ─────────────────────────────────────────────────────────────────
 *
 *  Pure module. NO database access. NO side effects.
 *  All inputs come in via arguments; all results are returned.
 *  This makes the engine 100% testable and reusable.
 *
 *  This module replicates the Excel logic exactly:
 *    1. Beam length = width + 2 * BEARING
 *    2. Raw rows  = length / BEAM_SPACING
 *    3. Rounded rows
 *    4. Actual covered length = rows * BEAM_SPACING - EDGE_OFFSET
 *    5. Delta = actual_length - length
 *    6. If delta > TOLERANCE  → final_rows = rows - 1, else final_rows = rows
 *    7. Corrected length = actual_length - TOLERANCE * (rows - final_rows)
 *    8. Blocks per row = ceil((beam_length - BLOCK_EDGE_LOSS) / BLOCK_LENGTH)
 *    9. Total blocks = blocks_per_row * final_rows
 *
 *  All decimal results are kept at 3-digit precision via `round3`.
 * ─────────────────────────────────────────────────────────────────
 */

// ── Types ───────────────────────────────────────────────────────

export interface CalculationConstants {
  BEAM_SPACING: number; // 0.58 m
  BEARING: number; // 0.15 m  – beam rests on each wall
  EDGE_OFFSET: number; // 0.035 m – edge offset
  BLOCK_LENGTH: number; // 0.195 m
  BLOCK_EDGE_LOSS: number; // 0.2 m  – removed from beam_length before block fit
  TOLERANCE: number; // 0.05 m  – row-correction tolerance
  TOPPING_THICKNESS: number; // m – concrete topping thickness (configurable)
}

export const DEFAULT_CONSTANTS: CalculationConstants = {
  BEAM_SPACING: 0.58,
  BEARING: 0.15,
  EDGE_OFFSET: 0.035,
  BLOCK_LENGTH: 0.195,
  BLOCK_EDGE_LOSS: 0.2,
  TOLERANCE: 0.05,
  TOPPING_THICKNESS: 0.05, // 5 cm topping by default
};

export interface SlabInput {
  /** Slab width in meters (perpendicular to beams). */
  width: number;
  /** Slab length in meters (parallel to beams – beams are laid along this dimension). */
  length: number;
}

export interface BeamGroup {
  length: number; // meters
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
  delta: number;
  concrete_volume: number;
  constants: CalculationConstants;
}

// ── Helpers ─────────────────────────────────────────────────────

/** Round half-away-from-zero to 3 decimal places (avoids JS banker's rounding). */
export function round3(n: number): number {
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(n) * 1000)) / 1000;
}

/** Round half-away-from-zero to 2 decimal places. */
export function round2(n: number): number {
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(n) * 100)) / 100;
}

/** Excel-style ROUND: half away from zero. */
function excelRound(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
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
  if (c.BEAM_SPACING <= 0) {
    throw new CalculationError("BEAM_SPACING must be > 0");
  }
  if (c.BLOCK_LENGTH <= 0) {
    throw new CalculationError("BLOCK_LENGTH must be > 0");
  }
}

// ── Main calculation ────────────────────────────────────────────

/**
 * Calculate beam-and-block layout for a single slab.
 *
 * @param input      slab geometry (width × length, meters)
 * @param overrides  optional constants overrides (admin-tunable values)
 */
export function calculateSlab(
  input: SlabInput,
  overrides: Partial<CalculationConstants> = {},
): SlabResult {
  const c: CalculationConstants = { ...DEFAULT_CONSTANTS, ...overrides };
  validateInput(input, c);

  const { width, length } = input;

  // STEP 1 – Beam length
  const beam_length = round3(width + 2 * c.BEARING);

  // STEP 2 – Raw rows + Excel ROUND
  const raw_rows = length / c.BEAM_SPACING;
  const rows = excelRound(raw_rows);

  // STEP 3 – Actual covered length
  const actual_length = round3(rows * c.BEAM_SPACING - c.EDGE_OFFSET);

  // STEP 4 – Length difference
  const delta = round3(actual_length - length);

  // STEP 5 – Correction
  const final_rows = delta > c.TOLERANCE ? rows - 1 : rows;

  // STEP 6 – Corrected length
  const corrected_length = round3(actual_length - c.TOLERANCE * (rows - final_rows));

  // STEP 7 – Blocks per row
  const blocks_per_row = Math.ceil((beam_length - c.BLOCK_EDGE_LOSS) / c.BLOCK_LENGTH);

  // STEP 8 – Total blocks
  const total_blocks = blocks_per_row * final_rows;

  // Beam grouping (rectangular slab → 1 group of identical beams).
  // Trapezoidal/irregular shapes use `calculateMultiSpan` below.
  const beam_count = final_rows;
  const beam_groups: BeamGroup[] = [{ length: beam_length, qty: beam_count }];

  // Concrete topping volume (m³) – width × corrected_length × topping
  const concrete_volume = round3(width * corrected_length * c.TOPPING_THICKNESS);

  return {
    beam_length,
    rows_initial: rows,
    rows_final: final_rows,
    beam_count,
    beam_groups,
    blocks_per_row,
    total_blocks,
    actual_length,
    corrected_length,
    delta,
    concrete_volume,
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
 * The row count and block math reuse the rectangular pipeline, applied to
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

  // Run the standard pipeline using the maximum width to ensure coverage.
  const base = calculateSlab({ width: maxW, length: input.length }, overrides);

  // Distribute the final row count evenly across the requested groups.
  // Lengths in each group are interpolated linearly between min and max width.
  const groups: BeamGroup[] = [];
  const rowsPerGroup = Math.floor(base.beam_count / groupCount);
  let remainder = base.beam_count - rowsPerGroup * groupCount;

  for (let i = 0; i < groupCount; i++) {
    const t = groupCount === 1 ? 0 : i / (groupCount - 1);
    const widthAt = minW + (maxW - minW) * t;
    const beamLen = round3(widthAt + 2 * c.BEARING);
    const qty = rowsPerGroup + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    groups.push({ length: beamLen, qty });
  }

  return { ...base, beam_groups: groups };
}
