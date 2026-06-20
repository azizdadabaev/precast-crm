import { describe, it, expect } from "vitest";
import { packRooms } from "@/lib/cad/sheet/sheet-pack";
import { calculateSlab } from "@/services/calculation-engine";
import { DEFAULT_SHEET_OPTIONS } from "@/lib/cad/sheet/sheet-scale";
import type { SheetRegion } from "@/lib/cad/sheet/sheet-plan";

const opts = DEFAULT_SHEET_OPTIONS;
const region: SheetRegion = { xMm: 10, yMm: 22, wMm: 277, hMm: 95 };

// mm bounding box of a placed room (inner box only, at the shared scale).
const roomBox = (calc: ReturnType<typeof calculateSlab>, mmPerCm: number) => ({
  wMm: Math.round(calc.inner_width * 100) * mmPerCm,
  hMm: Math.round(calc.inner_length * 100) * mmPerCm,
});

const overlaps = (
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) => a.x < b.x + b.w - 1e-6 && a.x + a.w - 1e-6 > b.x && a.y < b.y + b.h - 1e-6 && a.y + a.h - 1e-6 > b.y;

describe("sheet-pack packRooms", () => {
  it("packs 3 rooms: 3 placements, positive scale, non-overlapping & within region", () => {
    const rooms = [
      { name: "A", calc: calculateSlab({ inner_width: 3.2, inner_length: 5.0 }) },
      { name: "B", calc: calculateSlab({ inner_width: 4.0, inner_length: 3.5 }) },
      { name: "C", calc: calculateSlab({ inner_width: 2.8, inner_length: 4.2 }) },
    ];
    const pack = packRooms(rooms, region, opts);
    expect(pack.placements.length).toBe(3);
    expect(pack.mmPerCm).toBeGreaterThan(0);

    const boxes = pack.placements.map((p) => {
      const bb = roomBox(p.calc, pack.mmPerCm);
      return { x: p.offXMm, y: p.offYMm, w: bb.wMm, h: bb.hMm };
    });

    // All within the region.
    for (const b of boxes) {
      expect(b.x).toBeGreaterThanOrEqual(region.xMm - 1e-6);
      expect(b.y).toBeGreaterThanOrEqual(region.yMm - 1e-6);
      expect(b.x + b.w).toBeLessThanOrEqual(region.xMm + region.wMm + 1e-6);
      expect(b.y + b.h).toBeLessThanOrEqual(region.yMm + region.hMm + 1e-6);
    }

    // Pairwise non-overlapping.
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++)
        expect(overlaps(boxes[i], boxes[j])).toBe(false);
  });

  it("single room: 1 placement, centred in the region", () => {
    const calc = calculateSlab({ inner_width: 3.2, inner_length: 5.0 });
    const pack = packRooms([{ name: "Solo", calc }], region, opts);
    expect(pack.placements.length).toBe(1);

    const bb = roomBox(calc, pack.mmPerCm);
    const p = pack.placements[0];
    // The packed extent includes a gap gutter; the room box sits centred within
    // that extent, which is itself centred in the region — so the room's own
    // box is offset from region centre by at most half the gutter.
    const roomCx = p.offXMm + bb.wMm / 2;
    const roomCy = p.offYMm + bb.hMm / 2;
    const regionCx = region.xMm + region.wMm / 2;
    const regionCy = region.yMm + region.hMm / 2;
    const halfGapMm = (40 * pack.mmPerCm) / 2;
    expect(Math.abs(roomCx - regionCx)).toBeLessThanOrEqual(halfGapMm + 1e-6);
    expect(Math.abs(roomCy - regionCy)).toBeLessThanOrEqual(halfGapMm + 1e-6);
  });
});
