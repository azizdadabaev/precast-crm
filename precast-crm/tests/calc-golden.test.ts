import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { GOLDEN_CASES, buildGolden, buildGazoblokGolden } from "../scripts/export-calc-golden";
import { calculateSlab, projectTotal, DEFAULT_PRICE_CONFIG, type SlabResult } from "@/services/calculation-engine";
import { computeOrderTotals } from "@/lib/order-totals";

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
      expect(calculateSlab(c.input, c.pricing ?? DEFAULT_PRICE_CONFIG)).toEqual(c.result);
    }
    expect(g.pricing).toEqual(DEFAULT_PRICE_CONFIG);
  });
  it("project vectors are reproducible from projectTotal", () => {
    const g = buildGolden();
    for (const c of g.project.cases) {
      const rooms = c.input.room_subtotals.map((subtotal) => ({ subtotal }) as SlabResult);
      const r = projectTotal(rooms, c.input.discount_percent, c.input.discount_amount_override ?? undefined);
      expect({
        rooms_subtotal: r.rooms_subtotal,
        discount_percent: r.discount_percent,
        discount_amount: r.discount_amount,
        total: r.total,
      }).toEqual(c.result);
    }
  });
  it("order-totals vectors are reproducible from computeOrderTotals", () => {
    const g = buildGolden();
    for (const c of g.orderTotals.cases) {
      const r = computeOrderTotals(
        c.input.rooms,
        {
          discountPercent: c.input.discount_percent,
          discountAmount: c.input.discount_amount,
          deliveryCost: c.input.delivery_cost,
          otherCost: c.input.other_cost,
        },
        DEFAULT_PRICE_CONFIG,
      );
      expect({
        rooms_subtotal: r.roomsSubtotal,
        discount_amount: r.discountAmount,
        resolved_discount_percent: r.resolvedDiscountPercent,
        discount_mode: r.discountMode,
        total_price: r.totalPrice,
      }).toEqual(c.result);
    }
  });
  it("docs/api/calc-golden.json matches the engine (run `npm run golden:calc` if this fails)", () => {
    const committed = readFileSync(path.resolve(process.cwd(), "../docs/api/calc-golden.json"), "utf8");
    expect(committed).toEqual(JSON.stringify(buildGolden(), null, 2) + "\n");
  });
  it("docs/api/gazoblok-golden.json matches the engine (run `npm run golden:calc` if this fails)", () => {
    const committed = readFileSync(path.resolve(process.cwd(), "../docs/api/gazoblok-golden.json"), "utf8");
    expect(committed).toEqual(JSON.stringify(buildGazoblokGolden(), null, 2) + "\n");
  });
});
