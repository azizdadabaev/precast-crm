/**
 * Input validation for the tapered engine — pure, returns structured
 * errors and warnings instead of throwing (per §8 of SPEC.md).
 *
 * Errors block computation entirely; the UI will render the error
 * panel and skip the report. Warnings are non-blocking guidance.
 */

import {
  MAX_BEAM_SPAN_M,
  MAX_PRODUCIBLE_BEAM_M,
  VERIFY_TAG,
} from "./helpers";

export interface ValidationOutcome {
  errors: string[];
  warnings: string[];
}

interface NormalizedInputs {
  width1: number;
  width2: number;
  length: number;
  length1: number | null;
  length2: number | null;
  beamSpacing: number;
}

/**
 * Validate the geometry inputs ONLY. Downstream computations may add
 * further warnings (e.g. extreme |C_r|, short row count).
 */
export function validateInputs(input: NormalizedInputs): ValidationOutcome {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [k, v] of Object.entries({
    width1: input.width1,
    width2: input.width2,
    length: input.length,
  })) {
    if (!Number.isFinite(v) || (v as number) <= 0) {
      errors.push(`${k} must be a positive finite number (metres)`);
    }
  }

  if (input.length1 !== null) {
    if (!Number.isFinite(input.length1) || input.length1 <= 0) {
      errors.push("length1 must be a positive finite number when provided");
    }
  }
  if (input.length2 !== null) {
    if (!Number.isFinite(input.length2) || input.length2 <= 0) {
      errors.push("length2 must be a positive finite number when provided");
    }
  }

  if (!Number.isFinite(input.beamSpacing) || input.beamSpacing <= 0) {
    errors.push("beamSpacing must be a positive finite number (metres)");
  }

  // Producibility — depends on the [VERIFY §12] sentinel.
  const widestSide = Math.max(input.width1, input.width2);
  if (Number.isFinite(widestSide) && widestSide > MAX_PRODUCIBLE_BEAM_M) {
    errors.push(
      `Widest side (${widestSide.toFixed(2)} m) exceeds the maximum producible beam length ` +
        `${MAX_PRODUCIBLE_BEAM_M.toFixed(2)} m ${VERIFY_TAG} — request structural review.`,
    );
  }
  if (Number.isFinite(widestSide) && widestSide > MAX_BEAM_SPAN_M) {
    errors.push(
      `Widest side (${widestSide.toFixed(2)} m) exceeds the maximum beam span ` +
        `${MAX_BEAM_SPAN_M.toFixed(2)} m ${VERIFY_TAG} — request structural verification.`,
    );
  }

  // Standard-spacing reminder — non-blocking.
  if (Number.isFinite(input.beamSpacing) && Math.abs(input.beamSpacing - 0.58) > 1e-6) {
    warnings.push(
      `Beam spacing ${input.beamSpacing} m differs from the factory standard 0.58 m — ` +
        "calculations will run, but installation conventions assume 0.58 m centres.",
    );
  }

  return { errors, warnings };
}

/**
 * Add downstream warnings/errors that depend on geometry results.
 * Called from `computeTaper` after the per-row math runs.
 */
export function addGeometryWarnings({
  cr,
  rowsPractical,
}: {
  cr: number;
  rowsPractical: number;
}): { warnings: string[] } {
  const warnings: string[] = [];
  if (Math.abs(cr) > 0.5 + 1e-9) {
    warnings.push(
      "Extreme taper — hybrid slab strongly recommended (|C_r| > 0.50 m).",
    );
  }
  if (rowsPractical < 3) {
    warnings.push(
      "Geometry too short for practical taper distribution (fewer than 3 rows).",
    );
  }
  return { warnings };
}

/**
 * Italian construction practice (D.M. 09/01/1996; EN 15037-related)
 * requires transverse distribution ribs (nervature trasversali di
 * ripartizione) on tapered slabs whose beam member length exceeds
 * 4.50 m. Beam member = innerWidth + 2 × bearing; with bearing 0.15 m
 * the trigger is innerWidth > 4.20 m on ANY row. The check is
 * geometric only — it is not a substitute for structural design.
 *
 * Returns a single bilingual warning string when triggered, or null.
 * Lives outside `addGeometryWarnings` so callers can flag the
 * structural rib message specifically (UI uses a different icon for
 * it).
 */
export const TRANSVERSE_RIB_WARNING_PREFIX =
  "Trapeziya plitada beton balkalar 4.50 m dan узун";

export function addTransverseRibWarning(
  perRowInnerWidths: number[],
): string | null {
  const TRIGGER = 4.2 + 1e-9; // beam member > 4.50 ⇒ inner width > 4.20
  const triggers = perRowInnerWidths.some((w) => Math.abs(w) > TRIGGER);
  if (!triggers) return null;
  return (
    `${TRANSVERSE_RIB_WARNING_PREFIX} — қурилиш қоидаларига кўра кўндаланг ` +
    "тақсимот қовурғаси (nervature trasversali) талаб қилинади. " +
    "Структуравий муҳандис билан маслаҳатлашинг. · " +
    "Tapered slab with beam members > 4.50 m — construction code " +
    "requires transverse distribution ribs. Consult a structural " +
    "engineer. (Reference: D.M. 09/01/1996; EN 15037-related " +
    "practice; not a structural-design substitute.)"
  );
}
