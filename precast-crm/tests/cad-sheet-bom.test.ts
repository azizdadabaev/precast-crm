import { describe, it, expect } from "vitest";
import { buildBomBlock } from "@/lib/cad/sheet/sheet-bom";
import { calculateSlab, projectTotal } from "@/services/calculation-engine";
import { estimateProjectWeight } from "@/lib/cad/sheet/weight";
import type { SheetRegion } from "@/lib/cad/sheet/sheet-plan";
import { DEFAULT_SHEET_OPTIONS } from "@/lib/cad/sheet/sheet-scale";

const grp = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

describe("sheet-bom", () => {
  const region: SheetRegion = { xMm: 10, yMm: 120, wMm: 277, hMm: 80 };
  const calc = calculateSlab({ inner_width: 3.2, inner_length: 5.0 });
  const prims = buildBomBlock([{ name: "Хона 1", calc }], region, DEFAULT_SHEET_OPTIONS);

  it("emits a header row of text cells", () => {
    const texts = prims.filter((p) => p.type === "text");
    // 7 header columns + room cells + totals; at minimum the 7 headers exist.
    const headerLabels = ["Хона", "Шаблон", "Балка", "Ғишт", "Нарх"];
    for (const h of headerLabels) {
      expect(texts.some((t) => t.type === "text" && t.text === h)).toBe(true);
    }
  });

  it("emits exactly one room data row carrying beam_count and total_blocks", () => {
    const texts = prims.filter((p) => p.type === "text") as Extract<typeof prims[number], { type: "text" }>[];
    // beam_count appears as part of "N×len"; total_blocks as a standalone cell.
    expect(texts.some((t) => t.text.startsWith(`${calc.beam_count}×`))).toBe(true);
    expect(texts.some((t) => t.text === `${calc.total_blocks}`)).toBe(true);
    // The room name appears exactly once (one data row).
    expect(texts.filter((t) => t.text === "Хона 1").length).toBe(1);
  });

  it("totals row price equals projectTotal formatted", () => {
    const totals = projectTotal([calc], 0);
    const texts = prims.filter((p) => p.type === "text") as Extract<typeof prims[number], { type: "text" }>[];
    expect(texts.some((t) => t.text === grp(totals.total))).toBe(true);
    expect(texts.some((t) => t.text === grp(totals.rooms_subtotal))).toBe(true);
  });

  it("emits a discount line only when discountPercent > 0", () => {
    const noDisc = buildBomBlock([{ name: "Хона 1", calc }], region, DEFAULT_SHEET_OPTIONS, 0);
    expect(noDisc.some((p) => p.type === "text" && p.text.startsWith("Чегирма"))).toBe(false);

    const withDisc = buildBomBlock([{ name: "Хона 1", calc }], region, DEFAULT_SHEET_OPTIONS, 10);
    const t = projectTotal([calc], 10);
    expect(withDisc.some((p) => p.type === "text" && p.text === `-${grp(t.discount_amount)}`)).toBe(true);
    expect(withDisc.some((p) => p.type === "text" && p.text === grp(t.total))).toBe(true);
  });

  it("emits a weight text primitive containing the kg total", () => {
    const weight = estimateProjectWeight([calc]);
    const texts = prims.filter((p) => p.type === "text") as Extract<typeof prims[number], { type: "text" }>[];
    const kgStr = weight.totalKg.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    expect(texts.some((t) => t.text.includes(kgStr) && t.text.includes("kg"))).toBe(true);
  });

  it("keeps every primitive within the region box", () => {
    const x1 = region.xMm - 1e-6;
    const x2 = region.xMm + region.wMm + 1e-6;
    const y1 = region.yMm - 1e-6;
    const y2 = region.yMm + region.hMm + 1e-6;
    for (const p of prims) {
      if (p.type === "rect") {
        expect(p.xMm).toBeGreaterThanOrEqual(x1);
        expect(p.xMm + p.wMm).toBeLessThanOrEqual(x2);
        expect(p.yMm).toBeGreaterThanOrEqual(y1);
        expect(p.yMm + p.hMm).toBeLessThanOrEqual(y2);
      } else if (p.type === "line") {
        for (const x of [p.x1Mm, p.x2Mm]) { expect(x).toBeGreaterThanOrEqual(x1); expect(x).toBeLessThanOrEqual(x2); }
        for (const y of [p.y1Mm, p.y2Mm]) { expect(y).toBeGreaterThanOrEqual(y1); expect(y).toBeLessThanOrEqual(y2); }
      } else {
        expect(p.xMm).toBeGreaterThanOrEqual(x1);
        expect(p.xMm).toBeLessThanOrEqual(x2);
        expect(p.yMm).toBeGreaterThanOrEqual(y1);
        expect(p.yMm).toBeLessThanOrEqual(y2);
      }
    }
  });
});
