import { describe, it, expect } from "vitest";
import { pickArchScale, A4_LANDSCAPE, usableSheetMm, SCALE_RATIOS } from "@/lib/cad/sheet/sheet-scale";

describe("sheet-scale", () => {
  it("usable area subtracts margins from the page", () => {
    const u = usableSheetMm(A4_LANDSCAPE, 10);
    expect(u.wMm).toBeCloseTo(297 - 20, 6);
    expect(u.hMm).toBeCloseTo(210 - 20, 6);
  });

  it("picks the FIRST ratio whose drawing fits the usable sheet", () => {
    const s = pickArchScale(500, 300, A4_LANDSCAPE, 10);
    expect(s.ratio).toBe(50);
    expect(s.mmPerCm).toBeCloseTo(1 / 50 * 10, 9);
    expect(s.drawWMm).toBeCloseTo(100, 6);
    expect(s.drawHMm).toBeCloseTo(60, 6);
  });

  it("falls to a coarser ratio for a big plan, and never returns < the coarsest", () => {
    const s = pickArchScale(2000, 1200, A4_LANDSCAPE, 10);
    expect(s.ratio).toBeGreaterThan(50);
    expect(s.drawWMm).toBeLessThanOrEqual(277 + 1e-6);
    expect(s.drawHMm).toBeLessThanOrEqual(190 + 1e-6);
    const big = pickArchScale(100000, 100000, A4_LANDSCAPE, 10);
    expect(big.ratio).toBe(SCALE_RATIOS[SCALE_RATIOS.length - 1]);
    expect(big.overflow).toBe(true);
  });
});
