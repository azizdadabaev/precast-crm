import { describe, it, expect } from "vitest";
import { sheetTotals } from "@/lib/layout-board/totals";
import { autoArrange } from "@/lib/layout-board/arrange";
import { roomRect, overlaps } from "@/lib/layout-board/model";
import { calculateSlab } from "@/services/calculation-engine";
import { rows0708d } from "./fixtures/layout-0708d";

describe("sheetTotals", () => {
  it("matches quote 0708D exactly", () => {
    const t = sheetTotals(rows0708d());
    expect(t.beamsByLength).toEqual([
      { lengthM: 4.9, count: 60 },
      { lengthM: 6.1, count: 8 },
    ]);
    expect(t.totalBlocks).toBe(1554);
    expect(Math.abs(t.totalAreaM2 - 193.02)).toBeLessThan(0.005);
    expect(t.roomCount).toBe(12);
    expect(t.placedCount).toBe(0);
  });

  it("counts extras-only beams but no blocks", () => {
    const rows = rows0708d();
    const extras = { ...rows[0], id: "x", innerLength: 0, extraBeams: 2,
      result: calculateSlab({ inner_width: 4.6, inner_length: 0, extra_beams: 2 }) };
    const t = sheetTotals([...rows, extras]);
    expect(t.beamsByLength[0]).toEqual({ lengthM: 4.9, count: 62 });
    expect(t.totalBlocks).toBe(1554);
  });

  it("skips rows with no result", () => {
    const rows = rows0708d();
    const t = sheetTotals([...rows, { ...rows[0], id: "n", result: null }]);
    expect(t.totalBlocks).toBe(1554);
    expect(t.roomCount).toBe(12);
  });
});

describe("autoArrange", () => {
  it("lays unplaced rooms left to right, one wall apart, top-aligned, no overlaps", () => {
    const rows = rows0708d().slice(0, 3);
    const out = autoArrange(rows, new Map(), 30);
    const r = rows.map((row) => roomRect(row, out.get(row.id)!));
    expect(r.map((x) => x.y)).toEqual([0, 0, 0]);
    expect(r[0].x).toBe(0);
    expect(r[1].x).toBe(r[0].w + 30);
    expect(r[2].x).toBe(r[0].w + 30 + r[1].w + 30);
    expect(overlaps(r[0], r[1]) || overlaps(r[1], r[2])).toBe(false);
  });

  it("starts to the right of rooms already placed and returns only new entries", () => {
    const rows = rows0708d().slice(0, 2);
    const placed = new Map([[rows[0].id, { x: 100, y: 50, rot: 0 as const }]]);
    const out = autoArrange(rows, placed, 30);
    expect([...out.keys()]).toEqual([rows[1].id]);
    expect(out.get(rows[1].id)).toEqual({ x: 100 + 345 + 30, y: 50, rot: 0 });
  });
});
