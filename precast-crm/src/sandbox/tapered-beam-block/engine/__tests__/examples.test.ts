import { describe, expect, it } from "vitest";
import { computeTaper } from "../compute-taper";

describe("§10 worked examples", () => {
  it("Example 1 — Mild trapezoid (single beam)", () => {
    const r = computeTaper({ width1: 3.7, width2: 3.9, length: 5.7 });

    expect(r.errors).toEqual([]);
    expect(r.deltaW).toBeCloseTo(0.2, 6);
    // (0.20 / 5.70) × 0.58 ≈ 0.020350877…
    expect(r.changePerRow).toBeCloseTo(0.0204, 3);
    // §15 bump rule: R = 5.70 − 9 × 0.58 = 0.48 > 0.45 → bump → 10 pitches
    expect(r.rowsPractical).toBe(10);
    expect(r.bumped).toBe(true);
    // Beams = pitches + 1, one at each pitch boundary including both walls.
    expect(r.beamCount).toBe(11);
    expect(r.groupingStrategy).toBe(1);
    expect(r.requiresHybrid).toBe(false);
    expect(r.severity).toBe("small");

    // Endpoint contract: first and last beams sit on the walls exactly.
    expect(r.perRowInnerWidths[0]).toBeCloseTo(3.7, 9);
    expect(r.perRowInnerWidths[r.rowsPractical]).toBeCloseTo(3.9, 9);

    // Single-beam strategy: one group covering all 11 beams.
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].qty).toBe(11);
    // Stock inner width covers the widest row, rounded up to BEAM_STOCK_STEP.
    expect(r.groups[0].innerWidth).toBeGreaterThanOrEqual(3.9);
  });

  it("Example 2 — Medium taper (3 groups)", () => {
    const r = computeTaper({ width1: 3.75, width2: 4.45, length: 8.7 });

    expect(r.errors).toEqual([]);
    expect(r.deltaW).toBeCloseTo(0.7, 6);
    // (0.70 / 8.70) × 0.58 ≈ 0.0467
    expect(r.changePerRow).toBeCloseTo(0.0467, 3);
    // 8.70 / 0.58 = 15 exactly → R = 0 → no bump → 15 pitches, 16 beams.
    expect(r.rowsPractical).toBe(15);
    expect(r.bumped).toBe(false);
    expect(r.beamCount).toBe(16);
    expect(r.groupingStrategy).toBe(3);
    expect(r.severity).toBe("medium");
    expect(r.requiresHybrid).toBe(false);

    // Endpoint contract.
    expect(r.perRowInnerWidths[0]).toBeCloseTo(3.75, 9);
    expect(r.perRowInnerWidths[r.rowsPractical]).toBeCloseTo(4.45, 9);

    expect(r.groups).toHaveLength(3);
    // Sum of group quantities equals beamCount.
    expect(r.groups.reduce((s, g) => s + g.qty, 0)).toBe(16);
    // Stock lengths must monotonically cover their group max.
    for (const g of r.groups) {
      const maxInGroup = Math.max(
        ...g.rowsCovered.map((i) => r.perRowInnerWidths[i]),
      );
      expect(g.innerWidth).toBeGreaterThanOrEqual(maxInGroup - 1e-9);
    }
  });

  it("Example 3 — Extreme wedge (hybrid)", () => {
    const r = computeTaper({ width1: 5.0, width2: 2.0, length: 1.6 });

    expect(r.errors).toEqual([]);
    expect(r.deltaW).toBeCloseTo(-3.0, 6);
    // (-3.00 / 1.60) × 0.58 ≈ −1.0875 (sign preserved → narrowing)
    expect(r.changePerRow).toBeCloseTo(-1.0875, 3);
    // §15 bump rule: R = 1.60 − 2 × 0.58 = 0.44 ≤ 0.45 → no bump.
    // The previous engine used `ceil` which gave 3 pitches here; the
    // new bump rule mirrors the production engine and stops at 2.
    expect(r.rowsPractical).toBe(2);
    expect(r.bumped).toBe(false);
    expect(r.beamCount).toBe(3);
    expect(r.requiresHybrid).toBe(true);
    expect(r.groupingStrategy).toBe("hybrid");

    // Endpoint contract — even on the hybrid path.
    expect(r.perRowInnerWidths[0]).toBeCloseTo(5.0, 9);
    expect(r.perRowInnerWidths[r.rowsPractical]).toBeCloseTo(2.0, 9);

    // Both extreme-taper and short-row warnings should appear.
    const joinedWarnings = r.warnings.join(" | ").toLowerCase();
    expect(joinedWarnings).toContain("extreme");

    // Numeric group count is still meaningful for the beam-block portion.
    expect(r.groupCount).toBeGreaterThanOrEqual(1);
  });
});
