/**
 * Tapered beam-and-block calculation — main entry point.
 *
 * Pure function. No side effects. No I/O. No DB.
 * Returns a single `TaperResult` with structured errors and warnings;
 * never throws.
 *
 * §-references throughout point to SPEC.md (the canonical skill spec)
 * which lives next to this file.
 */

import {
  buildGroups,
  buildGroupsForHybrid,
  compareTiers,
  decideHybrid,
  severityFromCr,
  tierFromDeltaW,
  tierFromSeverity,
} from "./grouping";
import {
  DEFAULT_BEAM_SPACING,
  EPS,
  TOPPING_THICKNESS,
  VERIFY_TAG,
  WASTE_BEAMS_PCT,
  WASTE_BLOCKS_PCT,
  round3,
} from "./helpers";
import {
  addGeometryWarnings,
  validateInputs,
} from "./validation";
import type { BeamGroup, TaperInput, TaperResult, Tier } from "./types";

// Routing message used when a rectangular input lands here by mistake.
// Keep verbatim — the SPEC §0 wording is shown to the operator.
export const ROUTING_MESSAGE_RECTANGULAR =
  "This room is rectangular, not tapered. The taper-grouping skill " +
  "doesn't apply here — a rectangular slab uses one beam length " +
  "across all rows. Want me to run a straight rectangular take-off " +
  "instead?";

export function computeTaper(input: TaperInput): TaperResult {
  // ── 1. Normalize / default the inputs ─────────────────────
  const beamSpacing = input.beamSpacing ?? DEFAULT_BEAM_SPACING;
  const length1 = input.length1 ?? null;
  const length2 = input.length2 ?? null;
  const irregular =
    length1 !== null && length2 !== null && Math.abs(length1 - length2) > EPS;
  const effectiveLength = irregular
    ? round3((length1 + length2) / 2)
    : input.length;

  const normalized = {
    width1: input.width1,
    width2: input.width2,
    length: input.length,
    length1,
    length2,
    beamSpacing,
  };

  // ── 2. Validate. On any error, short-circuit with a stub. ──
  const { errors, warnings } = validateInputs(normalized);
  const isRectangular =
    Math.abs(input.width1 - input.width2) < EPS && !irregular;

  if (errors.length > 0) {
    return makeStub({
      ...normalized,
      effectiveLength,
      isRectangular,
      errors,
      warnings,
    });
  }

  // ── 3. §0 routing guard for rectangular inputs ────────────
  if (isRectangular) {
    return makeStub({
      ...normalized,
      effectiveLength,
      isRectangular: true,
      errors: [ROUTING_MESSAGE_RECTANGULAR],
      warnings,
    });
  }

  // ── 4. Geometry math (§3) ─────────────────────────────────
  const deltaW = round3(input.width2 - input.width1);
  // Carry change-per-metre / change-per-row at full precision. The
  // production engine's "round3 for beam-length math" guidance is for
  // ABSOLUTE lengths (W_n, beam_length); applying it to a per-row
  // RATE drifts visibly over many rows (e.g. ~5 cm over 14 rows for a
  // ΔW=0.70 m taper).
  const changePerMetre = deltaW / effectiveLength;
  const changePerRow = changePerMetre * beamSpacing;
  const rowsRaw = input.length / beamSpacing;
  const rowsTheoretical = round3(rowsRaw);
  // §3.2: floor is the integer-row count; §3.7 then says "either a
  // partial final row is added or the edge strip absorbs the
  // difference". The spec's worked Example 1 (5.70/0.58=9.83 → 10)
  // expects the partial-row-added behaviour to be the default, so
  // ceil-on-remainder is what we encode.
  const rowsPractical = Math.ceil(rowsRaw - EPS);

  const perRowInnerWidths: number[] = [];
  for (let n = 0; n < rowsPractical; n++) {
    perRowInnerWidths.push(round3(input.width1 + changePerRow * n));
  }

  // ── 5. Geometry-derived warnings ──────────────────────────
  const { warnings: geomWarnings } = addGeometryWarnings({
    cr: changePerRow,
    rowsPractical,
  });
  warnings.push(...geomWarnings);

  // ── 6. §4 — strategy from ΔW and from |C_r|, take the harsher ─
  const severity = severityFromCr(changePerRow);
  const tierByDelta = tierFromDeltaW(deltaW);
  const tierByCr = tierFromSeverity(severity);
  let tier: Tier = compareTiers(tierByDelta, tierByCr);

  // ── 7. §4.3 — hybrid escape ───────────────────────────────
  // First compute what the group count would be without hybrid, then
  // ask `decideHybrid` whether it should fire anyway.
  const tentativeNumeric =
    typeof tier === "number" ? tier : 4; // pretend tier 4 for the count probe
  const hybridDecision = decideHybrid({
    cr: changePerRow,
    rowsPractical,
    groupCountIfNotHybrid: tentativeNumeric,
  });

  if (hybridDecision.requiresHybrid) {
    tier = "hybrid";
    for (const r of hybridDecision.reasons) {
      // Avoid duplicating the |C_r| > 0.50 warning (already added above).
      if (!warnings.some((w) => w.includes(r) || r.includes(w))) {
        warnings.push(r);
      }
    }
  }

  // Reject the degenerate "every row a unique SKU" case (§8) when it
  // wasn't already absorbed by the hybrid branch above. With my
  // grouping algorithm, hybrid fires whenever group_count >= rows, so
  // this is a defensive fallback.
  if (
    typeof tier === "number" &&
    tier >= rowsPractical &&
    rowsPractical > 0
  ) {
    errors.push(
      "Geometry would require a unique beam SKU per row — refusing " +
        "to compute. Adjust dimensions or accept the hybrid strategy.",
    );
    return makeStub({
      ...normalized,
      effectiveLength,
      isRectangular,
      errors,
      warnings,
    });
  }

  // ── 8. Build groups ───────────────────────────────────────
  const targetGroups =
    tier === "hybrid" ? Math.min(2, Math.max(1, rowsPractical)) : tier;
  const groups: BeamGroup[] =
    tier === "hybrid"
      ? buildGroupsForHybrid(perRowInnerWidths)
      : buildGroups(perRowInnerWidths, targetGroups);

  // ── 9. Bill of materials (best-effort, with [VERIFY] notes) ─
  const billOfMaterials = computeBom({
    groups,
    perRowInnerWidths,
    rowsPractical,
    effectiveLength,
    beamSpacing,
    requiresHybrid: tier === "hybrid",
  });

  // ── 10. Return the full result ────────────────────────────
  return {
    width1: input.width1,
    width2: input.width2,
    length: input.length,
    length1,
    length2,
    beamSpacing,

    deltaW,
    changePerMetre,
    changePerRow,
    rowsTheoretical,
    rowsPractical,
    effectiveLength,
    perRowInnerWidths,

    groupingStrategy: tier,
    groupCount: groups.length,
    groups,

    isRectangular: false,
    requiresHybrid: tier === "hybrid",
    severity,

    billOfMaterials,

    warnings,
    errors,
  };
}

// ── Helpers ─────────────────────────────────────────────────

interface StubArgs {
  width1: number;
  width2: number;
  length: number;
  length1: number | null;
  length2: number | null;
  beamSpacing: number;
  effectiveLength: number;
  isRectangular: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Build a result object for the "no-compute" cases (validation
 * failure or rectangular routing). All numeric fields are zeroed but
 * structured so the UI never has to special-case the missing report.
 */
function makeStub(a: StubArgs): TaperResult {
  return {
    width1: a.width1,
    width2: a.width2,
    length: a.length,
    length1: a.length1,
    length2: a.length2,
    beamSpacing: a.beamSpacing,

    deltaW: 0,
    changePerMetre: 0,
    changePerRow: 0,
    rowsTheoretical: 0,
    rowsPractical: 0,
    effectiveLength: a.effectiveLength,
    perRowInnerWidths: [],

    groupingStrategy: 1,
    groupCount: 0,
    groups: [],

    isRectangular: a.isRectangular,
    requiresHybrid: false,
    severity: "small",

    billOfMaterials: { beams: 0, blocks: 0, notes: [] },

    warnings: a.warnings,
    errors: a.errors,
  };
}

function computeBom({
  groups,
  perRowInnerWidths,
  rowsPractical,
  effectiveLength,
  beamSpacing,
  requiresHybrid,
}: {
  groups: BeamGroup[];
  perRowInnerWidths: number[];
  rowsPractical: number;
  effectiveLength: number;
  beamSpacing: number;
  requiresHybrid: boolean;
}) {
  // Beams: total qty across groups, plus an [VERIFY] waste note.
  const beams = groups.reduce((s, g) => s + g.qty, 0);

  // Block math is intentionally lightweight here. The production
  // engine has a precise formula tied to inner_width / BLOCK_LENGTH;
  // for the sandbox we use a coarse area-based estimate so the report
  // has SOMETHING to show, with a clear caveat.
  const widestRow = perRowInnerWidths.length
    ? Math.max(...perRowInnerWidths.map((w) => Math.abs(w)))
    : 0;
  const approxBlocksPerRow = widestRow > 0 ? Math.ceil(widestRow / 0.2) : 0;
  const blocks = approxBlocksPerRow * rowsPractical;

  const notes: string[] = [
    `Block count is a coarse estimate (rows × ⌈max width / 0.20 m⌉). ${VERIFY_TAG} — block catalog not yet integrated; refer to the production engine for exact figures.`,
    `Concrete topping volume not computed here; thickness placeholder ${TOPPING_THICKNESS} m. ${VERIFY_TAG}`,
    `Waste allowances (placeholders): blocks ${(WASTE_BLOCKS_PCT * 100).toFixed(0)}%, beams ${(WASTE_BEAMS_PCT * 100).toFixed(0)}%. ${VERIFY_TAG}`,
  ];
  if (requiresHybrid) {
    const wedgeAreaApprox = round3(
      (effectiveLength - rowsPractical * beamSpacing) * widestRow,
    );
    notes.push(
      `Hybrid strategy: a monolithic concrete wedge is poured for the slab tail. ` +
        `Approx wedge plan area ${wedgeAreaApprox} m² — confirm with structural engineer. ${VERIFY_TAG}`,
    );
  }

  return { beams, blocks, notes };
}
