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

  it("numbers each beam B1..Bn and draws a pitch chain (Phase 3)", () => {
    const calc = calculateSlab({ inner_width: 3.2, inner_length: 5.0 });
    const plan = buildRoomPlan(
      { name: "Хона 1", calc, beamDir: "H" },
      { page: A4_LANDSCAPE, marginMm: 10, fontScale: 1 },
    );
    const n = calc.beam_count;

    // Exactly N beamnum texts, reading B1..BN.
    const beamNums = plan.primitives.filter(
      (p): p is Extract<typeof p, { type: "text" }> => p.type === "text" && p.role === "beamnum",
    );
    expect(beamNums.length).toBe(n);
    const labels = new Set(beamNums.map((t) => t.text));
    for (let i = 1; i <= n; i++) expect(labels.has(`B${i}`)).toBe(true);

    // Pitch chain: N ticks (lines) and at least N-1 spacing labels.
    const pitchTicks = plan.primitives.filter((p) => p.type === "line" && p.role === "pitch");
    const pitchLabels = plan.primitives.filter((p) => p.type === "text" && p.role === "pitch");
    expect(pitchTicks.length).toBe(n);
    expect(pitchLabels.length).toBeGreaterThanOrEqual(n - 1);

    // Spacing labels should be ≈ 580 mm (PITCH 58 cm × 10).
    for (const t of pitchLabels) {
      if (t.type !== "text") continue;
      expect(Number(t.text)).toBeGreaterThan(500);
      expect(Number(t.text)).toBeLessThan(650);
    }

    // All new primitives stay within the page box.
    for (const p of plan.primitives) {
      if (p.type === "rect") {
        expect(p.xMm).toBeGreaterThanOrEqual(-1e-6);
        expect(p.yMm).toBeGreaterThanOrEqual(-1e-6);
        expect(p.xMm + p.wMm).toBeLessThanOrEqual(plan.widthMm + 1e-6);
        expect(p.yMm + p.hMm).toBeLessThanOrEqual(plan.heightMm + 1e-6);
      } else if (p.type === "line") {
        for (const x of [p.x1Mm, p.x2Mm]) { expect(x).toBeGreaterThanOrEqual(-1e-6); expect(x).toBeLessThanOrEqual(plan.widthMm + 1e-6); }
        for (const y of [p.y1Mm, p.y2Mm]) { expect(y).toBeGreaterThanOrEqual(-1e-6); expect(y).toBeLessThanOrEqual(plan.heightMm + 1e-6); }
      } else {
        expect(p.xMm).toBeGreaterThanOrEqual(-1e-6);
        expect(p.xMm).toBeLessThanOrEqual(plan.widthMm + 1e-6);
        expect(p.yMm).toBeGreaterThanOrEqual(-1e-6);
        expect(p.yMm).toBeLessThanOrEqual(plan.heightMm + 1e-6);
      }
    }
  });

  it("rotates beam numbers -90° for a V-oriented room", () => {
    // A wide-but-short room defaults to beams running "V" (spaced along x).
    const calc = calculateSlab({ inner_width: 5.0, inner_length: 3.2 });
    const plan = buildRoomPlan(
      { name: "Хона V", calc, beamDir: "V" },
      { page: A4_LANDSCAPE, marginMm: 10, fontScale: 1 },
    );
    const beamNums = plan.primitives.filter(
      (p): p is Extract<typeof p, { type: "text" }> => p.type === "text" && p.role === "beamnum",
    );
    expect(beamNums.length).toBe(calc.beam_count);
    for (const t of beamNums) expect(t.angleDeg).toBe(-90);

    // Pitch chain for V room: N ticks + ≥N-1 labels, all inside the page.
    const pitchTicks = plan.primitives.filter((p) => p.type === "line" && p.role === "pitch");
    const pitchLabels = plan.primitives.filter((p) => p.type === "text" && p.role === "pitch");
    expect(pitchTicks.length).toBe(calc.beam_count);
    expect(pitchLabels.length).toBeGreaterThanOrEqual(calc.beam_count - 1);
    for (const p of plan.primitives) {
      if (p.type === "line") {
        for (const y of [p.y1Mm, p.y2Mm]) { expect(y).toBeGreaterThanOrEqual(-1e-6); expect(y).toBeLessThanOrEqual(plan.heightMm + 1e-6); }
      }
    }
  });
});
