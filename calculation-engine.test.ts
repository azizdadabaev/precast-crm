import { describe, it, expect } from "vitest";
import {
  calculateSlab,
  calculateMultiSpan,
  DEFAULT_CONSTANTS,
  round3,
  CalculationError,
} from "../src/services/calculation-engine";

describe("round3", () => {
  it("rounds to 3 decimals half-away-from-zero", () => {
    expect(round3(0.1234)).toBe(0.123);
    expect(round3(0.1235)).toBe(0.124);
    expect(round3(-0.1235)).toBe(-0.124);
    expect(round3(1.9999)).toBe(2);
  });
});

describe("calculateSlab – step-by-step Excel reference cases", () => {
  it("Case A: width=4, length=6 (clean, no correction needed)", () => {
    const r = calculateSlab({ width: 4, length: 6 });

    // Step 1: beam_length = 4 + 2 * 0.15 = 4.30
    expect(r.beam_length).toBe(4.3);

    // Step 2: raw_rows = 6 / 0.58 = 10.3448 → ROUND → 10
    expect(r.rows_initial).toBe(10);

    // Step 3: actual_length = 10 * 0.58 - 0.035 = 5.765
    expect(r.actual_length).toBe(5.765);

    // Step 4: delta = 5.765 - 6 = -0.235
    expect(r.delta).toBe(-0.235);

    // Step 5: delta (-0.235) ≤ TOLERANCE (0.05) → final_rows stays at 10
    expect(r.rows_final).toBe(10);

    // Step 6: corrected_length = 5.765 - 0.05 * (10 - 10) = 5.765
    expect(r.corrected_length).toBe(5.765);

    // Step 7: blocks_per_row = ceil((4.3 - 0.2) / 0.195) = ceil(21.025) = 22
    expect(r.blocks_per_row).toBe(22);

    // Step 8: total_blocks = 22 * 10 = 220
    expect(r.total_blocks).toBe(220);

    expect(r.beam_count).toBe(10);
    expect(r.beam_groups).toEqual([{ length: 4.3, qty: 10 }]);
  });

  it("Case B: width=3, length=5 (delta forces correction)", () => {
    const r = calculateSlab({ width: 3, length: 5 });

    // beam_length = 3 + 0.30 = 3.30
    expect(r.beam_length).toBe(3.3);

    // raw_rows = 5 / 0.58 = 8.6206 → ROUND → 9
    expect(r.rows_initial).toBe(9);

    // actual_length = 9 * 0.58 - 0.035 = 5.185
    expect(r.actual_length).toBe(5.185);

    // delta = 5.185 - 5 = 0.185 > 0.05 → correction triggers
    expect(r.delta).toBeCloseTo(0.185, 3);
    expect(r.rows_final).toBe(8);

    // corrected_length = 5.185 - 0.05 * (9 - 8) = 5.135
    expect(r.corrected_length).toBeCloseTo(5.135, 3);

    // blocks_per_row = ceil((3.3 - 0.2) / 0.195) = ceil(15.897) = 16
    expect(r.blocks_per_row).toBe(16);

    // total_blocks = 16 * 8 = 128
    expect(r.total_blocks).toBe(128);
  });

  it("Case C: width=6, length=8 (large slab)", () => {
    const r = calculateSlab({ width: 6, length: 8 });

    // beam_length = 6.30
    expect(r.beam_length).toBe(6.3);

    // raw_rows = 8 / 0.58 = 13.7931 → ROUND → 14
    expect(r.rows_initial).toBe(14);

    // actual_length = 14 * 0.58 - 0.035 = 8.085
    expect(r.actual_length).toBe(8.085);

    // delta = 8.085 - 8 = 0.085 > 0.05 → correct
    expect(r.delta).toBeCloseTo(0.085, 3);
    expect(r.rows_final).toBe(13);

    // blocks_per_row = ceil((6.3 - 0.2) / 0.195) = ceil(31.282) = 32
    expect(r.blocks_per_row).toBe(32);

    // total_blocks = 32 * 13 = 416
    expect(r.total_blocks).toBe(416);
  });

  it("Case D: small slab width=2.5, length=3", () => {
    const r = calculateSlab({ width: 2.5, length: 3 });
    expect(r.beam_length).toBe(2.8);
    // raw_rows = 3 / 0.58 = 5.172 → 5
    expect(r.rows_initial).toBe(5);
    // actual = 5*0.58 - 0.035 = 2.865
    expect(r.actual_length).toBe(2.865);
    // delta = 2.865 - 3 = -0.135 → no correction
    expect(r.rows_final).toBe(5);
    // blocks_per_row = ceil((2.8 - 0.2)/0.195) = ceil(13.333) = 14
    expect(r.blocks_per_row).toBe(14);
    expect(r.total_blocks).toBe(70);
  });
});

describe("calculateSlab – constants & overrides", () => {
  it("returns the constants used in the result", () => {
    const r = calculateSlab({ width: 4, length: 6 });
    expect(r.constants).toEqual(DEFAULT_CONSTANTS);
  });

  it("respects overridden TOLERANCE", () => {
    // With looser tolerance the correction step should not trigger.
    const tight = calculateSlab({ width: 3, length: 5 }, { TOLERANCE: 0.05 });
    const loose = calculateSlab({ width: 3, length: 5 }, { TOLERANCE: 0.5 });
    expect(tight.rows_final).toBe(8);
    expect(loose.rows_final).toBe(9);
  });

  it("respects overridden BEARING", () => {
    const r = calculateSlab({ width: 4, length: 6 }, { BEARING: 0.2 });
    expect(r.beam_length).toBe(4.4);
  });

  it("computes concrete topping volume from corrected_length × width × topping", () => {
    const r = calculateSlab({ width: 4, length: 6 }, { TOPPING_THICKNESS: 0.05 });
    // 4 * 5.765 * 0.05 = 1.153
    expect(r.concrete_volume).toBeCloseTo(1.153, 3);
  });
});

describe("calculateSlab – validation", () => {
  it("rejects non-positive width", () => {
    expect(() => calculateSlab({ width: 0, length: 5 })).toThrow(CalculationError);
    expect(() => calculateSlab({ width: -1, length: 5 })).toThrow(CalculationError);
  });

  it("rejects non-positive length", () => {
    expect(() => calculateSlab({ width: 5, length: 0 })).toThrow(CalculationError);
  });

  it("rejects NaN / Infinity", () => {
    expect(() => calculateSlab({ width: NaN, length: 5 })).toThrow(CalculationError);
    expect(() => calculateSlab({ width: 5, length: Infinity })).toThrow(CalculationError);
  });
});

describe("calculateMultiSpan – beam grouping rules", () => {
  it("≤0.25 m span → 1 group", () => {
    const r = calculateMultiSpan({ length: 6, widths: [4, 4.2] });
    expect(r.beam_groups).toHaveLength(1);
  });

  it("0.25–0.50 m span → 2 groups", () => {
    const r = calculateMultiSpan({ length: 6, widths: [4, 4.4] });
    expect(r.beam_groups).toHaveLength(2);
  });

  it("0.50–0.80 m span → 3 groups", () => {
    const r = calculateMultiSpan({ length: 6, widths: [4, 4.7] });
    expect(r.beam_groups).toHaveLength(3);
  });

  it(">0.80 m span → 4 groups", () => {
    const r = calculateMultiSpan({ length: 6, widths: [4, 5.0] });
    expect(r.beam_groups).toHaveLength(4);
  });

  it("group quantities sum to total beam_count", () => {
    const r = calculateMultiSpan({ length: 8, widths: [4, 5] });
    const total = r.beam_groups.reduce((s, g) => s + g.qty, 0);
    expect(total).toBe(r.beam_count);
  });

  it("rejects empty widths array", () => {
    expect(() => calculateMultiSpan({ length: 5, widths: [] })).toThrow(CalculationError);
  });
});
