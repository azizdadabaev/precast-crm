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
  /** floor(rowsTheoretical) — the practical row count. */
  rowsPractical: number;
  /** L_effective if irregular quad, else `length`. */
  effectiveLength: number;

  /**
   * Inner width at row n = width1 + (C_r × n) for n = 0..rowsPractical-1.
   * Sign of C_r is preserved — values may decrease on a narrowing slab.
   * These are inner (wall-to-wall) widths, not beam member lengths;
   * the beam member at row n is `perRowInnerWidths[n] + 2 × bearing`.
   */
  perRowInnerWidths: number[];

  // ── Strategy decision ─────────────────────────────────────
  /** 1 / 2 / 3 / 4 / "hybrid" — the chosen grouping strategy. */
  groupingStrategy: Tier;
  /** Numeric group count, also for hybrid (covers the beam-block portion). */
  groupCount: number;
  groups: BeamGroup[];

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
