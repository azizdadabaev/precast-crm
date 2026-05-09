import { describe, expect, it } from "vitest";
import { computeTaper } from "../compute-taper";
import { BLOCK_PITCH_M } from "../helpers";

describe("per-row blocks", () => {
  it("acceptance geometry (3, 4, 5) produces 9 distinct beams climbing 3.000 → 4.000", () => {
    const r = computeTaper({ width1: 3, width2: 4, length: 5 });

    expect(r.errors).toEqual([]);
    // §15 bump rule: R = 5 − 8 × 0.58 = 0.36 ≤ 0.45 → no bump → 8 pitches, 9 beams.
    expect(r.rowsPractical).toBe(8);
    expect(r.bumped).toBe(false);
    expect(r.beamCount).toBe(9);
    expect(r.perRowDetails).toHaveLength(9);

    // Endpoint contract: first beam at width1, last at width2 — exactly.
    expect(r.perRowDetails[0].innerWidth).toBeCloseTo(3.0, 9);
    expect(r.perRowDetails[8].innerWidth).toBeCloseTo(4.0, 9);

    // Every beam's inner width is unique (no collapse / dedupe).
    const widths = r.perRowDetails.map((d) => d.innerWidth);
    const unique = new Set(widths.map((w) => w.toFixed(3)));
    expect(unique.size).toBe(9);

    // Each row's blocks = ceil(innerWidth / BLOCK_PITCH).
    for (const d of r.perRowDetails) {
      const expected = Math.ceil(Math.abs(d.innerWidth) / BLOCK_PITCH_M);
      expect(d.blocksInRow).toBe(expected);
    }
  });

  it("totalBlocksPerRowMode equals the sum of per-row block counts", () => {
    const inputs = [
      { width1: 3, width2: 4, length: 5 },
      { width1: 3.7, width2: 3.9, length: 5.7 },
      { width1: 3.75, width2: 4.45, length: 8.7 },
    ];
    for (const i of inputs) {
      const r = computeTaper(i);
      const expectedSum = r.perRowDetails.reduce(
        (s, d) => s + d.blocksInRow,
        0,
      );
      expect(r.totalBlocksPerRowMode).toBe(expectedSum);
    }
  });

  it("totalBlocksGroupedMode is always >= totalBlocksPerRowMode (grouped over-supplies)", () => {
    const inputs = [
      { width1: 3, width2: 4, length: 5 },
      { width1: 3.7, width2: 3.9, length: 5.7 },
      { width1: 3.75, width2: 4.45, length: 8.7 },
      { width1: 4, width2: 5, length: 10 },
    ];
    for (const i of inputs) {
      const r = computeTaper(i);
      expect(r.totalBlocksGroupedMode).toBeGreaterThanOrEqual(
        r.totalBlocksPerRowMode,
      );
    }
  });

  it("groupedMode block count matches the production formula per group", () => {
    const r = computeTaper({ width1: 3.75, width2: 4.45, length: 8.7 });
    const expected = r.groups.reduce(
      (s, g) =>
        s + Math.ceil(Math.abs(g.innerWidth) / BLOCK_PITCH_M) * g.qty,
      0,
    );
    expect(r.totalBlocksGroupedMode).toBe(expected);
  });
});
