import { describe, expect, it } from "vitest";
import { computeTaper } from "../compute-taper";

const TOL = 1e-6;

describe("endpoint widths (§3.5 contract)", () => {
  // The non-negotiable rule the operator stated: width1 and width2
  // are walls; the engine must produce a beam at each.
  const cases: Array<{ name: string; w1: number; w2: number; len: number }> = [
    { name: "narrow → wide, R<0.45 no bump", w1: 3, w2: 4, len: 5 },
    { name: "narrow → wide, R>0.45 bump",   w1: 2, w2: 4, len: 4 },
    { name: "mild trapezoid",                w1: 3.7, w2: 3.9, len: 5.7 },
    { name: "exact pitch alignment",         w1: 3.75, w2: 4.45, len: 8.7 },
    { name: "narrowing taper",               w1: 5.0, w2: 3.0, len: 4.5 },
    { name: "small length, R≈0.44 no bump",  w1: 5.0, w2: 2.0, len: 1.6 },
  ];

  for (const c of cases) {
    it(`${c.name}: first beam = width1, last beam = width2`, () => {
      const r = computeTaper({ width1: c.w1, width2: c.w2, length: c.len });
      expect(r.errors).toEqual([]);
      // First beam at the narrow-end wall.
      expect(r.perRowInnerWidths[0]).toBeCloseTo(c.w1, 9);
      // Last beam at the wide-end wall (last index = rowsPractical).
      expect(r.perRowInnerWidths[r.rowsPractical]).toBeCloseTo(c.w2, 9);
      // Tolerance on intermediate rows — linear interpolation has no
      // accumulated drift since each value is computed from the
      // endpoint formula directly.
      expect(Math.abs(r.perRowInnerWidths[0] - c.w1)).toBeLessThan(TOL);
      expect(
        Math.abs(r.perRowInnerWidths[r.rowsPractical] - c.w2),
      ).toBeLessThan(TOL);
    });

    it(`${c.name}: array length = rowsPractical + 1 = beamCount`, () => {
      const r = computeTaper({ width1: c.w1, width2: c.w2, length: c.len });
      expect(r.perRowInnerWidths.length).toBe(r.rowsPractical + 1);
      expect(r.beamCount).toBe(r.rowsPractical + 1);
      expect(r.perRowDetails.length).toBe(r.beamCount);
    });
  }

  it("monotonic interpolation between endpoints (widening case)", () => {
    const r = computeTaper({ width1: 3, width2: 4, length: 5 });
    for (let i = 1; i < r.perRowInnerWidths.length; i++) {
      expect(r.perRowInnerWidths[i]).toBeGreaterThanOrEqual(
        r.perRowInnerWidths[i - 1] - 1e-9,
      );
    }
  });

  it("monotonic interpolation between endpoints (narrowing case)", () => {
    const r = computeTaper({ width1: 5.0, width2: 3.0, length: 4.5 });
    for (let i = 1; i < r.perRowInnerWidths.length; i++) {
      expect(r.perRowInnerWidths[i]).toBeLessThanOrEqual(
        r.perRowInnerWidths[i - 1] + 1e-9,
      );
    }
  });
});
