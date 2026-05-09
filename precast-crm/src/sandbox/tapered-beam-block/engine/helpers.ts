/**
 * Math + sentinel constants for the tapered engine.
 *
 * The rounding helpers below are copied from
 * src/services/calculation-engine.ts to keep the sandbox self-contained
 * and severable. Do not import production engine helpers here.
 *
 * Sentinel constants are placeholders for [VERIFY §12] items in the
 * SPEC.md (catalog data, allowable spans, topping thickness, etc.).
 * Replace once the factory confirms real values.
 */

// ── Rounding (mirrors production engine) ────────────────────

/** Round half-away-from-zero to N decimals (avoids JS banker's rounding). */
export function roundN(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(n) * f)) / f;
}

export const round3 = (n: number) => roundN(n, 3);
export const round2 = (n: number) => roundN(n, 2);

/**
 * Round UP to the nearest multiple of `step`. Used to choose a stock
 * beam length that COVERS the maximum row width inside a group —
 * never undercut.
 */
export function roundUpToStep(value: number, step: number): number {
  if (step <= 0) return value;
  return roundN(Math.ceil(value / step - 1e-9) * step, 6);
}

// ── System constant from the production rule ────────────────

/** Beam-spacing default (factory standard). */
export const DEFAULT_BEAM_SPACING = 0.58;

/** Bearing default — half of the wall-into-bearing length on each side. */
export const DEFAULT_BEARING = 0.15;

// ── [VERIFY §12] sentinels — placeholders only ──────────────
//
// Each value below is a defensible default we use to keep the engine
// runnable until factory engineering provides the real number. Any
// calculation that depends on one of these MUST surface a warning so
// operators don't treat the placeholder as confirmed data.

/** Topping (poured concrete) thickness over the beam-and-block deck. */
// TODO §12: confirm topping thickness with structural engineer.
export const TOPPING_THICKNESS = 0.05;

/** Maximum length of beam the prestressing bed can produce. */
// TODO §12: confirm with the production team — real number is unknown.
export const MAX_PRODUCIBLE_BEAM_M = 12.0;

/**
 * Maximum simply-supported span the standard T-beam can carry under
 * the assumed live + dead load. Distinct from MAX_PRODUCIBLE_BEAM_M:
 * a beam may be PHYSICALLY producible at L but unsafe to install at
 * that span.
 */
// TODO §12: structural engineer must populate.
export const MAX_BEAM_SPAN_M = 10.0;

/** Stock beam length quantum — rolled to 5 cm for prestress-bed setup. */
// TODO §12: confirm step granularity from production cadence.
export const BEAM_STOCK_STEP = 0.05;

/**
 * Block dimensions (the standard hollow hourdi).
 * Listed in §6.2 as ≈ 500 × 100 × 200 mm.
 */
// TODO §12: validate against current catalog.
export const BLOCK_LENGTH_M = 0.5; // along the beam axis
export const BLOCK_VISIBLE_M = 0.45; // visible width between two beams (placeholder)

/**
 * Block transverse pitch — the dimension that determines how many
 * blocks fit between two beams across the inner width. Mirrors the
 * production engine's `BLOCK_LENGTH` (0.20 m). Per-row block count
 * is `Math.ceil(innerWidth / BLOCK_PITCH_M)`. Copied here, NOT
 * imported, to keep the sandbox severable.
 */
export const BLOCK_PITCH_M = 0.2;

/** Waste allowance — used only in the warning text, not in the BoM number. */
// TODO §12: confirm with materials team.
export const WASTE_BLOCKS_PCT = 0.05;
export const WASTE_BEAMS_PCT = 0.01;

/**
 * Standard label for a feature whose number flows from a [VERIFY §12]
 * sentinel. Operators see this in the UI's "Show details" panel.
 */
export const VERIFY_TAG = "[VERIFY §12]";

// ── Floating-point comparison epsilon ───────────────────────

/** Use to compare beam-length values that traveled through rounding. */
export const EPS = 1e-9;
