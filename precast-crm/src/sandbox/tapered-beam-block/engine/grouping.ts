/**
 * Grouping decision logic for the tapered engine.
 *
 * §4.1 — Tier from total taper |ΔW|.
 * §4.2 — Severity from per-row change |C_r|; mapped to a tier so the
 *        more-restrictive rule from §4 can compare apples-to-apples.
 * §4.3 — Hybrid trigger conditions.
 *
 * "More restrictive wins" is implemented as `compareTiers` returning
 * the higher of two tiers, with the order: hybrid > 4 > 3 > 2 > 1.
 *
 * Boundary convention (chosen once, applied consistently across both
 * §4.1 and §4.2): each upper-bound value belongs to the LOWER tier.
 *   |ΔW| = 0.25 → tier 1; 0.26 → tier 2;
 *   |ΔW| = 0.50 → tier 2; 0.51 → tier 3;
 *   |ΔW| = 0.80 → tier 3; 0.81 → tier 4.
 *   |C_r|: 0.029 < 0.03 stays "small"; exactly 0.03 → "medium";
 *          0.119 < 0.12 stays "medium"; exactly 0.12 → "extreme".
 * The §4.2 boundary uses strict-greater-than-or-equal at 0.03 and 0.12
 * because that's what the SPEC table reads literally.
 */

import { round3, roundUpToStep, EPS, BEAM_STOCK_STEP } from "./helpers";
import type { BeamGroup, Severity, Tier } from "./types";

// ── §4.1 — tier from |ΔW| ───────────────────────────────────

export function tierFromDeltaW(deltaW: number): Tier {
  const a = Math.abs(deltaW);
  if (a <= 0.25 + EPS) return 1;
  if (a <= 0.5 + EPS) return 2;
  if (a <= 0.8 + EPS) return 3;
  return 4;
}

// ── §4.2 — severity from |C_r| ──────────────────────────────

export function severityFromCr(cr: number): Severity {
  const a = Math.abs(cr);
  if (a < 0.03 - EPS) return "small";
  if (a < 0.12 - EPS) return "medium";
  return "extreme";
}

/** Map §4.2 severity to a comparable tier so §4 can pick the harsher of §4.1/§4.2. */
export function tierFromSeverity(sev: Severity): Tier {
  switch (sev) {
    case "small":
      return 1;
    case "medium":
      return 2;
    case "extreme":
      return "hybrid";
  }
}

// ── §4 — more restrictive wins ──────────────────────────────

/** Order key — higher value = stricter strategy. */
function tierRank(t: Tier): number {
  if (t === "hybrid") return 99;
  return t;
}

export function compareTiers(a: Tier, b: Tier): Tier {
  return tierRank(a) >= tierRank(b) ? a : b;
}

// ── §4.3 — hybrid trigger ───────────────────────────────────

export interface HybridDecision {
  requiresHybrid: boolean;
  reasons: string[];
}

export function decideHybrid({
  cr,
  rowsPractical,
  groupCountIfNotHybrid,
}: {
  cr: number;
  rowsPractical: number;
  /** What the group count WOULD be if we skipped the hybrid escape. */
  groupCountIfNotHybrid: number;
}): HybridDecision {
  const reasons: string[] = [];
  if (Math.abs(cr) > 0.5 + EPS) {
    reasons.push("Per-row change |C_r| > 0.50 m — hybrid required");
  }
  if (rowsPractical < 4) {
    reasons.push("Row count < 4 — hybrid required (geometry too short)");
  }
  if (
    groupCountIfNotHybrid >= rowsPractical &&
    rowsPractical > 0
  ) {
    reasons.push(
      "Every row would need a unique beam SKU — hybrid forced",
    );
  }
  return { requiresHybrid: reasons.length > 0, reasons };
}

// ── Group construction ──────────────────────────────────────

/**
 * Slice the per-row beam-length array into `targetGroups` contiguous
 * groups of approximately equal size, then pick a single stock beam
 * length for each group equal to the group's MAXIMUM row width
 * rounded up to BEAM_STOCK_STEP.
 *
 * Stock catalog is [VERIFY §12]; we use a 5 cm step here as a
 * defensible placeholder. `notes[]` for the BoM call this out.
 */
export function buildGroups(
  perRowBeamLengths: number[],
  targetGroups: number,
): BeamGroup[] {
  const N = perRowBeamLengths.length;
  if (N === 0) return [];

  const safeTarget = Math.max(1, Math.min(targetGroups, N));
  const groups: BeamGroup[] = [];

  // Even split: each group starts at floor(g * N / k) and ends at floor((g+1) * N / k) - 1.
  for (let g = 0; g < safeTarget; g++) {
    const startIdx = Math.floor((g * N) / safeTarget);
    const endIdx = Math.floor(((g + 1) * N) / safeTarget) - 1;
    const rowsCovered: number[] = [];
    let maxWidth = -Infinity;
    let minWidth = Infinity;
    for (let i = startIdx; i <= endIdx; i++) {
      rowsCovered.push(i);
      const w = perRowBeamLengths[i];
      if (w > maxWidth) maxWidth = w;
      if (w < minWidth) minWidth = w;
    }
    // For widening tapers maxWidth is the last row in the group; for
    // narrowing it's the first. Either way, picking max guarantees
    // every row in the group is structurally covered.
    const stock = round3(roundUpToStep(maxWidth, BEAM_STOCK_STEP));
    groups.push({
      beamLength: stock,
      qty: rowsCovered.length,
      rowsCovered,
    });
  }

  return groups;
}

/**
 * For a "hybrid" outcome we still produce beam groups for the part of
 * the slab that uses prestressed beams. The remainder (the wedge end)
 * is poured monolithically — no SKUs added there. We pick a target
 * group count of 2 for the beam portion as a sensible default, so the
 * factory still has a manageable SKU count even in the hybrid case.
 */
export function buildGroupsForHybrid(
  perRowBeamLengths: number[],
): BeamGroup[] {
  return buildGroups(perRowBeamLengths, 2);
}
