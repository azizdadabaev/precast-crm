import { describe, it, expect } from "vitest";
import { buildRoomPlan } from "@/lib/cad/sheet/sheet-plan";
import { calculateSlab } from "@/services/calculation-engine";
import { A4_LANDSCAPE } from "@/lib/cad/sheet/sheet-scale";

describe("sheet-plan", () => {
  it("builds a scaled plan with outline, beams, and two outer dimensions", () => {
    const calc = calculateSlab({ inner_width: 3.2, inner_length: 5.0 });
    const plan = buildRoomPlan(
      { name: "Хона 1", calc, beamDir: "H" },
      { page: A4_LANDSCAPE, marginMm: 10, fontScale: 1 },
    );
    const outline = plan.primitives.find((p) => p.type === "rect" && p.role === "outline");
    expect(outline).toBeTruthy();
    const beams = plan.primitives.filter((p) => p.type === "rect" && p.role === "beam");
    expect(beams.length).toBe(calc.beam_count);
    const dims = plan.primitives.filter((p) => p.type === "text" && p.role === "dim");
    expect(dims.length).toBe(2);
    expect(plan.scale.ratio).toBeGreaterThanOrEqual(50);
    for (const p of plan.primitives) {
      if ("xMm" in p) { expect(p.xMm).toBeGreaterThanOrEqual(-1e-6); expect(p.xMm).toBeLessThanOrEqual(A4_LANDSCAPE.wMm + 1e-6); }
    }
  });

  it("fits and centers the drawing inside a custom region", () => {
    const calc = calculateSlab({ inner_width: 3.2, inner_length: 5.0 });
    const region = { xMm: 10, yMm: 10, wMm: 277, hMm: 110 };
    const plan = buildRoomPlan({ name: "Хона 1", calc, beamDir: "H" }, { page: A4_LANDSCAPE, marginMm: 10, fontScale: 1 }, region);

    // The geometry (outline/beams/bearings) must stay within the region box.
    const drawn = plan.primitives.filter(
      (p) => p.type === "rect" && (p.role === "outline" || p.role === "beam" || p.role === "bearing"),
    );
    expect(drawn.length).toBeGreaterThan(0);
    for (const p of drawn) {
      if (p.type !== "rect") continue;
      expect(p.xMm).toBeGreaterThanOrEqual(region.xMm - 1e-6);
      expect(p.yMm).toBeGreaterThanOrEqual(region.yMm - 1e-6);
      expect(p.xMm + p.wMm).toBeLessThanOrEqual(region.xMm + region.wMm + 1e-6);
      expect(p.yMm + p.hMm).toBeLessThanOrEqual(region.yMm + region.hMm + 1e-6);
    }
  });
});
