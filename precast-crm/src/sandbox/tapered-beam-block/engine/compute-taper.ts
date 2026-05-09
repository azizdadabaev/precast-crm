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
  BLOCK_PITCH_M,
  DEFAULT_BEAM_SPACING,
  EPS,
  TOPPING_THICKNESS,
  VERIFY_TAG,
  WASTE_BEAMS_PCT,
  WASTE_BLOCKS_PCT,
  pitchesWithBump,
  round3,
} from "./helpers";
import {
  addGeometryWarnings,
  addTransverseRibWarning,
  validateInputs,
} from "./validation";
import type { BeamGroup, PerRowDetail, TaperInput, TaperResult, Tier } from "./types";

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
  // C_r reported = ΔW / length × S, computed from the raw inputs (NOT
  // from the bumped covered length). It's a reporting value the
  // operator reads on the geometry card; the actual beam interpolation
  // below uses the bumped covered length so the endpoints land on the
  // walls exactly.
  const changePerRow = changePerMetre * beamSpacing;
  const rowsRaw = effectiveLength / beamSpacing;
  const rowsTheoretical = round3(rowsRaw);
  // §3.2 + §15 — bump rule (mirrors the production engine's autoPickPattern):
  //   R = effectiveLength − floor(effectiveLength / S) × S
  //   R > 0.45 → bump pitches by 1 so the far wall has a beam.
  // The previous engine used `Math.ceil(rowsRaw − EPS)`, which always
  // bumped on any non-zero remainder. That was too aggressive for
  // R ≤ 0.45 cases and produced beam counts that didn't match the
  // production engine's own rule.
  const bumpDecision = pitchesWithBump(effectiveLength, beamSpacing);
  const rowsPractical = bumpDecision.pitches;
  const bumped = bumpDecision.bumped;
  // Covered length = pitches × S. Beams sit at positions
  // 0, S, 2S, ..., pitches × S; that's `pitches + 1` beams.
  const coveredLength = round3(rowsPractical * beamSpacing);
  const beamCount = rowsPractical + 1;

  // Per-row inner widths via linear interpolation over `coveredLength`.
  // Endpoint contract: W_0 === width1 and W_pitches === width2
  // exactly (within rounding). Loop is INCLUSIVE of pitches, so the
  // array length is rowsPractical + 1 — one beam at each pitch
  // boundary, including both walls.
  const perRowInnerWidths: number[] = [];
  if (rowsPractical === 0) {
    // Degenerate geometry — single wall, no interpolation. Validation
    // already errored, but be defensive.
    perRowInnerWidths.push(round3(input.width1));
  } else {
    for (let n = 0; n <= rowsPractical; n++) {
      const t = (n * beamSpacing) / coveredLength;
      const w = input.width1 + (input.width2 - input.width1) * t;
      perRowInnerWidths.push(round3(w));
    }
    // Guarantee the endpoints exactly, defending against floating-point
    // drift in the linear interpolation above.
    perRowInnerWidths[0] = round3(input.width1);
    perRowInnerWidths[rowsPractical] = round3(input.width2);
  }

  // Per-row detail (the operator's "per-row mode" output). Each row
  // gets its precise inner width and an exact block count derived from
  // the production engine's formula.
  const perRowDetails: PerRowDetail[] = perRowInnerWidths.map((w, i) => ({
    rowIndex: i,
    innerWidth: w,
    blocksInRow: Math.ceil(Math.abs(w) / BLOCK_PITCH_M),
  }));
  const totalBlocksPerRowMode = perRowDetails.reduce(
    (s, d) => s + d.blocksInRow,
    0,
  );

  // ── 5. Geometry-derived warnings ──────────────────────────
  const { warnings: geomWarnings } = addGeometryWarnings({
    cr: changePerRow,
    rowsPractical,
  });
  warnings.push(...geomWarnings);

  // §14 — transverse distribution rib warning. Fires regardless of
  // grouping or hybrid status; any row whose beam member length
  // (innerWidth + 2 × bearing) exceeds 4.50 m triggers it. Bearing
  // default is 0.15 m → trigger inner width threshold is 4.20 m.
  const ribWarning = addTransverseRibWarning(perRowInnerWidths);
  if (ribWarning) warnings.push(ribWarning);

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

  // Reject the degenerate "every beam a unique SKU" case (§8) when it
  // wasn't already absorbed by the hybrid branch above. With my
  // grouping algorithm, hybrid fires whenever group_count >= beams, so
  // this is a defensive fallback. Compare against beamCount (=
  // rowsPractical + 1) since beams are what get SKU'd, not pitches.
  if (
    typeof tier === "number" &&
    tier >= beamCount &&
    beamCount > 0
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
  // Grouped block total: each group covers its qty of rows with a
  // representative max inner width — every row in the group rounds UP
  // to that width, so block count is ⌈g.innerWidth / BLOCK_PITCH⌉ × qty.
  const totalBlocksGroupedMode = groups.reduce(
    (s, g) => s + Math.ceil(Math.abs(g.innerWidth) / BLOCK_PITCH_M) * g.qty,
    0,
  );
  const billOfMaterials = computeBom({
    groups,
    perRowInnerWidths,
    rowsPractical,
    effectiveLength,
    beamSpacing,
    requiresHybrid: tier === "hybrid",
    totalBlocksGroupedMode,
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
    beamCount,
    effectiveLength,
    coveredLength,
    bumped,
    perRowInnerWidths,
    perRowDetails,

    groupingStrategy: tier,
    groupCount: groups.length,
    groups,
    totalBlocksPerRowMode,
    totalBlocksGroupedMode,

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
    beamCount: 0,
    effectiveLength: a.effectiveLength,
    coveredLength: 0,
    bumped: false,
    perRowInnerWidths: [],
    perRowDetails: [],

    groupingStrategy: 1,
    groupCount: 0,
    groups: [],
    totalBlocksPerRowMode: 0,
    totalBlocksGroupedMode: 0,

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
  totalBlocksGroupedMode,
}: {
  groups: BeamGroup[];
  perRowInnerWidths: number[];
  rowsPractical: number;
  effectiveLength: number;
  beamSpacing: number;
  requiresHybrid: boolean;
  totalBlocksGroupedMode: number;
}) {
  // Beams: total qty across groups, plus an [VERIFY] waste note.
  const beams = groups.reduce((s, g) => s + g.qty, 0);

  // Block math now uses the production engine's per-row formula
  // (⌈inner_width / BLOCK_PITCH⌉). The grouped-mode total over-supplies
  // versus per-row because each group rounds UP to its widest row;
  // operators see both numbers in the Material Summary card.
  const widestRow = perRowInnerWidths.length
    ? Math.max(...perRowInnerWidths.map((w) => Math.abs(w)))
    : 0;
  const blocks = totalBlocksGroupedMode;

  const notes: string[] = [
    `Block count uses the production engine's per-row formula (⌈inner_width / ${BLOCK_PITCH_M.toFixed(2)} m⌉). Grouped mode rounds UP per group; per-row mode is exact.`,
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
