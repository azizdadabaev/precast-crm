/**
 * Public type surface for the tapered beam-and-block engine.
 *
 * Engine is pure: no DB, no I/O, no React. All inputs and outputs
 * are plain JSON-friendly values. Results carry their own
 * diagnostics (`warnings[]`, `errors[]`) — callers never see thrown
 * exceptions.
 */

/** Severity buckets for per-row taper change |C_r| (§4.2). */
export type Severity = "small" | "medium" | "extreme";

/** Numeric grouping tier from §4.1 / §4.2, plus the hybrid escape. */
export type Tier = 1 | 2 | 3 | 4 | "hybrid";

/**
 * Inputs accepted by `computeTaper`. All measurements in metres.
 * Irregular quadrilateral handling activates when both `length1` and
 * `length2` are provided AND they differ.
 */
export interface TaperInput {
  width1: number;
  width2: number;
  length: number;
  length1?: number;
  length2?: number;
  /** Default 0.58 m — the factory standard. */
  beamSpacing?: number;
}

/**
 * Per-row geometry + block detail. Operators may render the slab as
 * one calculator row per slab row (per-row mode) instead of per
 * grouped SKU; this carries everything needed to do that.
 */
export interface PerRowDetail {
  /** 0-based row index (UI displays 1-based). */
  rowIndex: number;
  /** Inner (wall-to-wall) width at this row, m, signed. */
  innerWidth: number;
  /** ⌈ |innerWidth| / BLOCK_PITCH ⌉. Mirrors the production engine. */
  blocksInRow: number;
}

/** One physical beam SKU produced for the slab. */
export interface BeamGroup {
  /**
   * Representative inner width in metres for this group — the maximum
   * inner width across the rows this SKU covers, rounded UP to
   * BEAM_STOCK_STEP. The actual beam member length is
   * `innerWidth + 2 × bearing`; the calculator that consumes this
   * computes the beam length itself.
   */
  innerWidth: number;
  /** Number of beams of this length. */
  qty: number;
  /** Row indices (0-based) covered by this SKU. */
  rowsCovered: number[];
}

/** Best-effort BoM. Block math uses placeholder estimates pending §12 catalog. */
export interface BillOfMaterials {
  beams: number;
  blocks: number;
  /**
   * Notes call out which figures rest on [VERIFY] inputs and any
   * caveats (e.g. monolithic wedge area for a hybrid slab).
   */
  notes: string[];
}

export interface TaperResult {
  // ── Inputs echoed (post-defaulting) ───────────────────────
  width1: number;
  width2: number;
  length: number;
  length1: number | null;
  length2: number | null;
  beamSpacing: number;

  // ── Geometry ──────────────────────────────────────────────
  /** ΔW = width2 − width1 (signed; positive widening, negative narrowing). */
  deltaW: number;
  /** C_m = ΔW / L_effective. */
  changePerMetre: number;
  /** C_r = C_m × beamSpacing (signed; preserves taper direction). */
  changePerRow: number;
  /** Raw row count length / spacing. */
  rowsTheoretical: number;
  /**
   * The chosen pitch count after the bump rule (§15). This is the
   * number of pitch SEGMENTS — there are `rowsPractical + 1` beams
   * on the slab (one at each pitch boundary, including both walls).
   */
  rowsPractical: number;
  /**
   * Total beam count, including the closing beam at the wide-end wall.
   * Equals `rowsPractical + 1`. Use this for any "how many SKUs" or
   * "how many beams" question.
   */
  beamCount: number;
  /** L_effective if irregular quad, else `length`. */
  effectiveLength: number;
  /**
   * Covered length after the bump decision: `rowsPractical × beamSpacing`.
   * This is the length over which inner-width interpolation happens, so
   * `perRowInnerWidths[0] === width1` and
   * `perRowInnerWidths[rowsPractical] === width2` are exact (within
   * floating-point rounding).
   */
  coveredLength: number;
  /**
   * True when `length − floor(length / S) × S > 0.45`, i.e. the bump
   * rule fired and the practical pitch count was raised by 1 so the
   * far wall has a beam. Surfaced in the UI's geometry card so the
   * operator can see the decision.
   */
  bumped: boolean;

  /**
   * Inner width at beam n for n = 0..rowsPractical (inclusive).
   * Endpoint contract:
   *   perRowInnerWidths[0]              === width1   (always)
   *   perRowInnerWidths[rowsPractical]  === width2   (always)
   * Interpolation is linear over `coveredLength`. Sign of (width2 −
   * width1) is preserved — values decrease on a narrowing slab.
   * The array length is `rowsPractical + 1` (= beamCount).
   */
  perRowInnerWidths: number[];

  /**
   * Per-row detail (operator's "per-row mode" output). One entry per
   * slab row, in row order. Always populated alongside `groups`; the
   * UI picks which to render based on the active view mode.
   */
  perRowDetails: PerRowDetail[];

  // ── Strategy decision ─────────────────────────────────────
  /** 1 / 2 / 3 / 4 / "hybrid" — the chosen grouping strategy. */
  groupingStrategy: Tier;
  /** Numeric group count, also for hybrid (covers the beam-block portion). */
  groupCount: number;
  groups: BeamGroup[];

  /**
   * Sum of `blocksInRow` across all rows (per-row mode total).
   * The production calculator would land on this number for the same
   * geometry.
   */
  totalBlocksPerRowMode: number;
  /**
   * Sum of (group.qty × ⌈group.innerWidth / BLOCK_PITCH⌉) across groups.
   * Always >= `totalBlocksPerRowMode` because each group rounds UP to
   * cover its widest row.
   */
  totalBlocksGroupedMode: number;

  // ── Diagnostics ───────────────────────────────────────────
  /** True when width1 === width2 AND no irregular sides given. */
  isRectangular: boolean;
  /** True when §4.3 hybrid trigger fires for any reason. */
  requiresHybrid: boolean;
  /** §4.2 severity from |C_r|. */
  severity: Severity;

  // ── Bill of materials ─────────────────────────────────────
  billOfMaterials: BillOfMaterials;

  // ── Issues ────────────────────────────────────────────────
  /** Non-blocking guidance the UI surfaces above the report. */
  warnings: string[];
  /** Blocking validation messages — UI shows these and skips the report. */
  errors: string[];
}
