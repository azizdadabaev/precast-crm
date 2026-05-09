import { describe, expect, it } from "vitest";
import {
  pitchesWithBump,
  SMALL_REMAINDER,
  MEDIUM_REMAINDER,
} from "../helpers";

const S = 0.58;

describe("pitchesWithBump (§15)", () => {
  it("R = 0 (length on a pitch line) → no bump", () => {
    // 5.80 = 10 × 0.58 exactly.
    const r = pitchesWithBump(5.8, S);
    expect(r.pitches).toBe(10);
    expect(r.bumped).toBe(false);
    expect(r.remainder).toBe(0);
  });

  it("R ≤ 0.20 (BGB territory in production) → no bump", () => {
    // 4.20 / 0.58 = 7.241 → floor = 7, R = 4.20 − 7×0.58 = 0.14.
    const r = pitchesWithBump(4.2, S);
    expect(r.pitches).toBe(7);
    expect(r.bumped).toBe(false);
    expect(r.remainder).toBeCloseTo(0.14, 9);
    expect(r.remainder).toBeLessThanOrEqual(SMALL_REMAINDER);
  });

  it("R between 0.20 and 0.45 (GBG territory) → no bump", () => {
    // 4.50 / 0.58 = 7.759 → floor = 7, R = 0.44.
    const r = pitchesWithBump(4.5, S);
    expect(r.pitches).toBe(7);
    expect(r.bumped).toBe(false);
    expect(r.remainder).toBeCloseTo(0.44, 9);
    expect(r.remainder).toBeGreaterThan(SMALL_REMAINDER);
    expect(r.remainder).toBeLessThanOrEqual(MEDIUM_REMAINDER);
  });

  it("R = 0.45 boundary (inclusive on lower side) → no bump", () => {
    // Construct length so R = exactly 0.45: pitches × S + 0.45 = 7 × 0.58 + 0.45 = 4.51.
    const r = pitchesWithBump(4.51, S);
    expect(r.pitches).toBe(7);
    expect(r.bumped).toBe(false);
  });

  it("R just past 0.45 → BUMP", () => {
    // 4.52 → floor = 7, R = 0.46 > 0.45 → bump to 8.
    const r = pitchesWithBump(4.52, S);
    expect(r.pitches).toBe(8);
    expect(r.bumped).toBe(true);
  });

  it("repro case: length = 4.0 → R = 0.52 → BUMP to 7 pitches", () => {
    // The original bug — engine was reporting only 7 beams (covering
    // up to 6 × 0.58 = 3.48 m), leaving 52 cm of slab unsupported.
    // Bump rule extends covered length to 7 × 0.58 = 4.06 m so the
    // far wall has a beam.
    const r = pitchesWithBump(4.0, S);
    expect(r.pitches).toBe(7);
    expect(r.bumped).toBe(true);
    expect(r.remainder).toBeCloseTo(0.52, 9);
  });

  it("returns safe defaults on bad input", () => {
    expect(pitchesWithBump(NaN, S)).toEqual({
      pitches: 0,
      remainder: 0,
      bumped: false,
    });
    expect(pitchesWithBump(5, 0)).toEqual({
      pitches: 0,
      remainder: 0,
      bumped: false,
    });
    expect(pitchesWithBump(5, -1)).toEqual({
      pitches: 0,
      remainder: 0,
      bumped: false,
    });
  });
});
