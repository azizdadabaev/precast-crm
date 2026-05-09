import { describe, expect, it } from "vitest";
import { compareTiers, tierFromDeltaW, tierFromSeverity, severityFromCr } from "../grouping";
import { computeTaper } from "../compute-taper";

/**
 * §4 — When the |ΔW| table and the |C_r| table disagree, the
 * MORE RESTRICTIVE result wins. Tier ordering:
 *   "hybrid" > 4 > 3 > 2 > 1
 */
describe("§4 more-restrictive-wins", () => {
  it("compareTiers returns the higher-rank tier", () => {
    expect(compareTiers(2, 3)).toBe(3);
    expect(compareTiers(4, "hybrid")).toBe("hybrid");
    expect(compareTiers(1, 1)).toBe(1);
    expect(compareTiers("hybrid", 4)).toBe("hybrid");
  });

  it("|ΔW| says tier 2, |C_r| says extreme/hybrid → final = hybrid", () => {
    // Pick a small |ΔW| (≤0.50) but a length short enough to make
    // |C_r| extreme. 0.40 / 1.20 × 0.58 ≈ 0.193 → extreme.
    const r = computeTaper({ width1: 3.6, width2: 4.0, length: 1.2 });
    // Component-level evidence for the decision:
    expect(tierFromDeltaW(r.deltaW)).toBe(2);
    expect(severityFromCr(r.changePerRow)).toBe("extreme");
    expect(tierFromSeverity(severityFromCr(r.changePerRow))).toBe("hybrid");
    // Final outcome (hybrid is the harsher result):
    expect(r.groupingStrategy).toBe("hybrid");
  });

  it("|ΔW| says tier 4, |C_r| says medium → final = 4", () => {
    // ΔW = 0.85 (> 0.80 → tier 4). Length long enough that |C_r| is
    // only medium: 0.85 / 12 × 0.58 ≈ 0.041.
    const r = computeTaper({ width1: 3.0, width2: 3.85, length: 12 });
    expect(tierFromDeltaW(r.deltaW)).toBe(4);
    expect(severityFromCr(r.changePerRow)).toBe("medium");
    // |C_r| medium → tier 2; max(4, 2) = 4. (No §4.3 trigger because
    // rowsPractical is large and |C_r| is moderate.)
    expect(r.groupingStrategy).toBe(4);
    expect(r.requiresHybrid).toBe(false);
  });
});
