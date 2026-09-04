import { describe, it, expect } from "vitest";
import { GOLDEN_CASES, buildGolden } from "../scripts/export-calc-golden";
import { calculateSlab, DEFAULT_PRICE_CONFIG } from "@/services/calculation-engine";

describe("calc golden vectors", () => {
  it("covers every pattern, extras-only, overrides, and the BLENDER_CALC_SPEC cases", () => {
    const names = GOLDEN_CASES.map((c) => c.name).join("\n");
    expect(names).toMatch(/GB/);
    expect(names).toMatch(/BGB/);
    expect(names).toMatch(/GBG/);
    expect(names).toMatch(/extras-only/);
    expect(names).toMatch(/spec-test-1/);
    expect(GOLDEN_CASES.length).toBeGreaterThanOrEqual(25);
  });
  it("results are reproducible from the engine", () => {
    const g = buildGolden();
    for (const c of g.cases) {
      expect(calculateSlab(c.input, DEFAULT_PRICE_CONFIG)).toEqual(c.result);
    }
    expect(g.pricing).toEqual(DEFAULT_PRICE_CONFIG);
  });
});
