import { describe, expect, it } from "vitest";
import { computeTaper } from "../compute-taper";

/**
 * §3.6 — When length1 ≠ length2, use L_effective = (length1+length2)/2
 * for the taper-rate math.
 */
describe("§3.6 irregular quadrilateral", () => {
  it("length1=5, length2=7 → effectiveLength = 6", () => {
    const r = computeTaper({
      width1: 3.6,
      width2: 4.2,
      length: 6, // overall length passed independently; not used for C_m
      length1: 5,
      length2: 7,
    });
    expect(r.errors).toEqual([]);
    expect(r.effectiveLength).toBeCloseTo(6, 6);
  });

  it("length1=5, length2=5 behaves like a non-irregular slab with length=5", () => {
    const irregular = computeTaper({
      width1: 3.6,
      width2: 4.2,
      length: 5,
      length1: 5,
      length2: 5,
    });
    const plain = computeTaper({ width1: 3.6, width2: 4.2, length: 5 });

    expect(irregular.effectiveLength).toBe(plain.effectiveLength);
    expect(irregular.changePerMetre).toBeCloseTo(plain.changePerMetre, 9);
    expect(irregular.rowsPractical).toBe(plain.rowsPractical);
    expect(irregular.groupingStrategy).toBe(plain.groupingStrategy);
  });

  it("only length is provided → effectiveLength === length", () => {
    const r = computeTaper({ width1: 3.6, width2: 4.2, length: 6 });
    expect(r.effectiveLength).toBe(6);
  });

  it("changePerMetre uses L_effective, not the raw length, when irregular", () => {
    const r = computeTaper({
      width1: 3,
      width2: 4,
      length: 100, // intentionally large to make the difference obvious
      length1: 5,
      length2: 7,
    });
    // ΔW=1, L_eff=6 → C_m = 1/6 ≈ 0.16667
    expect(r.changePerMetre).toBeCloseTo(1 / 6, 6);
  });
});
