import { describe, expect, it } from "vitest";
import { computeTaper } from "../compute-taper";

describe("§10 worked examples", () => {
  it("Example 1 — Mild trapezoid (single beam)", () => {
    const r = computeTaper({ width1: 3.7, width2: 3.9, length: 5.7 });

    expect(r.errors).toEqual([]);
    expect(r.deltaW).toBeCloseTo(0.2, 6);
    // (0.20 / 5.70) × 0.58 ≈ 0.020350877…
    expect(r.changePerRow).toBeCloseTo(0.0204, 3);
    expect(r.rowsPractical).toBe(10);
    expect(r.groupingStrategy).toBe(1);
    expect(r.requiresHybrid).toBe(false);
    expect(r.severity).toBe("small");

    // Single-beam strategy: one group covering all rows.
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].qty).toBe(10);
    // Stock inner width covers the widest row, rounded up to BEAM_STOCK_STEP.
    expect(r.groups[0].innerWidth).toBeGreaterThanOrEqual(3.9);
  });

  it("Example 2 — Medium taper (3 groups)", () => {
    const r = computeTaper({ width1: 3.75, width2: 4.45, length: 8.7 });

    expect(r.errors).toEqual([]);
    expect(r.deltaW).toBeCloseTo(0.7, 6);
    // (0.70 / 8.70) × 0.58 ≈ 0.0467
    expect(r.changePerRow).toBeCloseTo(0.0467, 3);
    expect(r.rowsPractical).toBe(15);
    expect(r.groupingStrategy).toBe(3);
    expect(r.severity).toBe("medium");
    expect(r.requiresHybrid).toBe(false);

    expect(r.groups).toHaveLength(3);
    // Sum of group quantities equals practical row count.
    expect(r.groups.reduce((s, g) => s + g.qty, 0)).toBe(15);
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
    expect(r.requiresHybrid).toBe(true);
    expect(r.groupingStrategy).toBe("hybrid");

    // Both extreme-taper and short-row warnings should appear.
    const joinedWarnings = r.warnings.join(" | ").toLowerCase();
    expect(joinedWarnings).toContain("extreme");

    // Numeric group count is still meaningful for the beam-block portion.
    expect(r.groupCount).toBeGreaterThanOrEqual(1);
  });
});
