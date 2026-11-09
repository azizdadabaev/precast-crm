import { describe, it, expect } from "vitest";
import { buildLayoutSheetSvg } from "@/lib/layout-board/sheet";
import { autoArrange } from "@/lib/layout-board/arrange";
import { rows0708d } from "./fixtures/layout-0708d";

const meta = {
  projectName: "0708D",
  clientName: "Tohirjon & <Co>",
  date: new Date(2026, 10, 9),
  wallCm: 30,
  logoHref: "data:image/png;base64,AAAA",
};

function placedRows() {
  const rows = rows0708d();
  const layouts = autoArrange(rows, new Map(), 30);
  return rows.map((r) => ({ ...r, layout: layouts.get(r.id) ?? null }));
}

describe("buildLayoutSheetSvg", () => {
  it("prints room sizes from the quote and the 0708D totals", () => {
    const svg = buildLayoutSheetSvg(placedRows(), meta);
    expect(svg).toContain("плита 4,90 × 4,06");
    expect(svg).toContain("хона 4,60 × 4,00");
    expect(svg).toContain("Балка 4,90 м — 60 та");
    expect(svg).toContain("Балка 6,10 м — 8 та");
    expect(svg).toContain("1 554");
    expect(svg).toContain("193,02");
    expect(svg).toContain("+998 93 481 33 30");
    expect(svg).toContain("Плита жойлашуви");
    expect(svg).toContain("09.11.2026");
  });

  it("has no dashed slab outline and escapes text", () => {
    const svg = buildLayoutSheetSvg(placedRows(), meta);
    expect(svg).not.toContain("stroke-dasharray");
    expect(svg).toContain("Tohirjon &amp; &lt;Co&gt;");
    expect(svg).not.toContain("<Co>");
  });

  it("draws one faint centred watermark", () => {
    const svg = buildLayoutSheetSvg(placedRows(), meta);
    expect(svg.match(/opacity="0\.08"/g)?.length).toBe(1);
  });

  it("notes unplaced rooms and keeps the totals of the whole quote", () => {
    const rows = placedRows();
    rows[3] = { ...rows[3], layout: null };
    const svg = buildLayoutSheetSvg(rows, meta);
    expect(svg).toContain("1 хона жойлаштирилмаган");
    expect(svg).toContain("Балка 4,90 м — 60 та");
    expect(svg).toContain("193,02");
  });
});

describe("sheet totals chips", () => {
  it("stay on the page and clear of the legend with 6 beam lengths", async () => {
    const { calculateSlab } = await import("@/services/calculation-engine");
    const { SHEET_W } = await import("@/lib/layout-board/sheet");
    const base = rows0708d()[0];
    const rows = [3.0, 3.5, 4.0, 4.5, 5.0, 5.5].map((w, i) => ({
      ...base, id: `w${i}`, innerWidth: w, innerLength: 3,
      result: calculateSlab({ inner_width: w, inner_length: 3 }),
      layout: { x: i * 400, y: 0, rot: 0 as const },
    }));
    const svg = buildLayoutSheetSvg(rows, meta);
    const chips = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" rx="14"/g)]
      .map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }));
    const legend = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="44" height="26"/g)].map((m) => ({ x: +m[1], y: +m[2] }));
    expect(chips.length).toBe(8);
    const legendLeft = Math.min(...legend.map((l) => l.x));
    for (const c of chips) {
      expect(c.x + c.w).toBeLessThanOrEqual(SHEET_W - 120);
      const sameBand = c.y < legend[0].y + 26 && legend[0].y < c.y + c.h;
      if (sameBand) expect(c.x + c.w).toBeLessThan(legendLeft);
    }
  });
});
