import { describe, expect, it } from "vitest";
import { computeTaper } from "../compute-taper";
import { BLOCK_PITCH_M } from "../helpers";

describe("per-row blocks", () => {
  it("acceptance geometry (3, 4, 5) produces 9 distinct rows climbing 3.000 → 3.928", () => {
    const r = computeTaper({ width1: 3, width2: 4, length: 5 });

    expect(r.errors).toEqual([]);
    expect(r.rowsPractical).toBe(9);
    expect(r.perRowDetails).toHaveLength(9);

    // Row 0 starts at width1, last row reaches width1 + 8 × C_r ≈ 3.928.
    expect(r.perRowDetails[0].innerWidth).toBeCloseTo(3.0, 3);
    expect(r.perRowDetails[8].innerWidth).toBeCloseTo(3.928, 3);

    // Every row's inner width is unique (no collapse / dedupe).
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
