import { describe, expect, it } from "vitest";
import { computeTaper } from "../compute-taper";

describe("reproducer · width1=2, width2=4, length=4 (the original bug)", () => {
  // Before the fix:
  //   - rowsPractical was 7 (via Math.ceil(rowsRaw - eps))
  //   - perRowInnerWidths had 7 entries, last = 3.740
  //   - 52 cm of the slab (3.48 m to 4.00 m) had no beam
  //
  // After the fix:
  //   - bump rule: floor(4 / 0.58) = 6, R = 0.52, R > 0.45 → bump → 7 pitches
  //   - beamCount = 8, last beam at exactly width2 = 4.000
  it("produces 8 beams, last beam at innerWidth 4.000", () => {
    const r = computeTaper({ width1: 2, width2: 4, length: 4 });

    expect(r.errors).toEqual([]);

    // Pitch / beam count contract.
    expect(r.rowsPractical).toBe(7);
    expect(r.bumped).toBe(true);
    expect(r.beamCount).toBe(8);
    expect(r.perRowInnerWidths).toHaveLength(8);
    expect(r.perRowDetails).toHaveLength(8);

    // Endpoint widths land on the walls exactly.
    expect(r.perRowInnerWidths[0]).toBeCloseTo(2.0, 9);
    expect(r.perRowInnerWidths[7]).toBeCloseTo(4.0, 9);
    expect(r.perRowDetails[0].innerWidth).toBeCloseTo(2.0, 9);
    expect(r.perRowDetails[7].innerWidth).toBeCloseTo(4.0, 9);

    // Covered length matches pitches × beamSpacing.
    expect(r.coveredLength).toBeCloseTo(7 * 0.58, 9);
  });

  it("intermediate widths interpolate linearly", () => {
    const r = computeTaper({ width1: 2, width2: 4, length: 4 });
    // Step = (4-2) / 7 = 0.2857… per beam.
    const step = (4 - 2) / 7;
    for (let n = 0; n <= 7; n++) {
      const expected = 2 + step * n;
      expect(r.perRowInnerWidths[n]).toBeCloseTo(expected, 3);
    }
  });
});
