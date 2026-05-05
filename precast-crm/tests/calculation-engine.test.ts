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

describe("calculateSlab – remainder-based logic (Excel replacement)", () => {
  it("Case A: width=4, length=6 (remainder = 0.20 ≥ 0.20 → filler row)", () => {
    const r = calculateSlab({ width: 4, length: 6 });

    // Step 1: beam_length = 4.3
    expect(r.beam_length).toBe(4.3);

    // Step 2: 6 / 0.58 = 10 with remainder 0.2
    expect(r.rows_initial).toBe(10);
    
    // remainder 0.20 >= 0.20 → rows_final = 11, beam_count = 10
    expect(r.rows_final).toBe(11);
    expect(r.beam_count).toBe(10);

    // Step 3: actual_length = 11 * 0.58 - 0.035 = 6.345
    expect(r.actual_length).toBe(6.345);

    // Step 7: blocks_per_row = 21
    expect(r.blocks_per_row).toBe(21);

    // Step 8: total_blocks = 21 * 11 = 231
    expect(r.total_blocks).toBe(231);
  });

  it("Case B: width=3, length=5 (remainder = 0.36 ≥ 0.20 → filler row)", () => {
    const r = calculateSlab({ width: 3, length: 5 });

    // 5 / 0.58 = 8 remainder 0.36
    expect(r.rows_initial).toBe(8);
    expect(r.rows_final).toBe(9);
    expect(r.beam_count).toBe(8);

    // actual_length = 9 * 0.58 - 0.035 = 5.185
    expect(r.actual_length).toBe(5.185);

    // blocks_per_row = 16
    expect(r.blocks_per_row).toBe(16);
    expect(r.total_blocks).toBe(144);
  });

  it("Case C: width=6, length=8 (remainder = 0.46 ≥ 0.20 → filler row)", () => {
    const r = calculateSlab({ width: 6, length: 8 });

    // 8 / 0.58 = 13 remainder 0.46
    expect(r.rows_initial).toBe(13);
    expect(r.rows_final).toBe(14);
    expect(r.beam_count).toBe(13);

    // actual_length = 14 * 0.58 - 0.035 = 8.085
    expect(r.actual_length).toBe(8.085);

    // blocks_per_row = 31
    expect(r.blocks_per_row).toBe(31);
    expect(r.total_blocks).toBe(434);
  });

  it("Case D: small slab width=2.5, length=3 (remainder = 0.10 < 0.20 → extra beam row)", () => {
    const r = calculateSlab({ width: 2.5, length: 3 });
    // 3 / 0.58 = 5 remainder 0.10
    expect(r.rows_initial).toBe(5);
    // remainder < 0.20 → rows_final = 6, beam_count = 6
    expect(r.rows_final).toBe(6);
    expect(r.beam_count).toBe(6);
    // actual = 6 * 0.58 - 0.035 = 3.445
    expect(r.actual_length).toBe(3.445);
    // blocks_per_row = 13
    expect(r.blocks_per_row).toBe(13);
    expect(r.total_blocks).toBe(78);
  });
});

describe("calculateSlab – constants & overrides", () => {
  it("returns the constants used in the result", () => {
    const r = calculateSlab({ width: 4, length: 6 });
    expect(r.constants).toEqual(DEFAULT_CONSTANTS);
  });

  it("respects overridden FILLER_THRESHOLD", () => {
    // length 5 → base 8, remainder 0.36. 
    // Default threshold 0.20 → remainder 0.36 >= 0.20 → filler row (beam_count 8)
    // Overridden threshold 0.50 → remainder 0.36 < 0.50 → extra beam (beam_count 9)
    const def = calculateSlab({ width: 3, length: 5 }, { FILLER_THRESHOLD: 0.20 });
    const high = calculateSlab({ width: 3, length: 5 }, { FILLER_THRESHOLD: 0.50 });
    expect(def.beam_count).toBe(8);
    expect(high.beam_count).toBe(9);
  });

  it("respects overridden BEARING", () => {
    const r = calculateSlab({ width: 4, length: 6 }, { BEARING: 0.2 });
    expect(r.beam_length).toBe(4.4);
  });

  it("computes concrete topping volume from actual_length × width × topping", () => {
    const r = calculateSlab({ width: 4, length: 6 }, { TOPPING_THICKNESS: 0.05 });
    // 4 * 6.345 * 0.05 = 1.269
    expect(r.concrete_volume).toBeCloseTo(1.269, 3);
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
