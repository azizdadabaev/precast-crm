import { describe, it, expect } from "vitest";
import {
  polygonArea,
  bbox,
  snapOrtho,
  snapToGrid,
  defaultBeamDir,
  decomposeToBays,
  bayToSlabInput,
  beamLayout,
  type Bay,
  type Rect,
  type Pt,
} from "@/lib/cad/geometry";
import { calculateSlab } from "@/services/calculation-engine";

// 3.20 m × 5.00 m rectangle (cm), beams running along the width (short side).
const rectW = 320;
const rectH = 500;
const rectLoop: Pt[] = [
  { x: 0, y: 0 },
  { x: rectW, y: 0 },
  { x: rectW, y: rectH },
  { x: 0, y: rectH },
];

// L-shape from the field sketch: a 340×622 outer with a notch removed.
const lShape: Pt[] = [
  { x: 0, y: 0 },
  { x: 340, y: 0 },
  { x: 340, y: 622 },
  { x: 0, y: 622 },
  { x: 0, y: 404 },
  { x: 100, y: 404 },
  { x: 100, y: 0 },
];

describe("cad geometry — helpers", () => {
  it("computes area and bbox", () => {
    expect(Math.abs(polygonArea(rectLoop))).toBe(rectW * rectH);
    expect(bbox(rectLoop)).toEqual({ x: 0, y: 0, w: 320, h: 500 });
  });

  it("snaps orthogonally and to grid", () => {
    expect(snapOrtho({ x: 0, y: 0 }, { x: 300, y: 40 })).toEqual({ x: 300, y: 0 });
    expect(snapOrtho({ x: 0, y: 0 }, { x: 40, y: 300 })).toEqual({ x: 0, y: 300 });
    expect(snapToGrid({ x: 47, y: 92 }, 10)).toEqual({ x: 50, y: 90 });
  });

  it("default beam direction runs along the shorter side", () => {
    expect(defaultBeamDir({ x: 0, y: 0, w: 320, h: 500 })).toBe("H"); // shorter is horizontal
    expect(defaultBeamDir({ x: 0, y: 0, w: 600, h: 300 })).toBe("V");
  });
});

describe("cad geometry — bay decomposition", () => {
  it("a rectangle decomposes to one bay of the same area", () => {
    const bays = decomposeToBays(rectLoop);
    expect(bays).toHaveLength(1);
    expect(bays[0].w * bays[0].h).toBe(rectW * rectH);
  });

  it("an L-shape decomposes into bays whose areas sum to the polygon area", () => {
    const bays = decomposeToBays(lShape);
    expect(bays.length).toBeGreaterThanOrEqual(2);
    const sum = bays.reduce((s, r) => s + r.w * r.h, 0);
    expect(sum).toBe(Math.abs(polygonArea(lShape)));
  });
});

describe("cad geometry — beamLayout overlay", () => {
  const within = (r: Rect, b: Rect) =>
    r.x >= b.x - 1e-6 &&
    r.y >= b.y - 1e-6 &&
    r.x + r.w <= b.x + b.w + 1e-6 &&
    r.y + r.h <= b.y + b.h + 1e-6;

  it("draws exactly beamCount beams, all inside the bay (H)", () => {
    const bay: Bay = { rect: { x: 0, y: 0, w: 320, h: 500 }, beamDir: "H" };
    const { beams, blockCells } = beamLayout(bay, 8, 8);
    expect(beams).toHaveLength(8);
    // H beams run along x → span the full width.
    for (const b of beams) {
      expect(b.w).toBe(320);
      expect(within(b, bay.rect)).toBe(true);
    }
    // 8 rows × ceil(320/20)=16 cols = 128 cells, all inside.
    expect(blockCells).toHaveLength(8 * 16);
    for (const c of blockCells) expect(within(c, bay.rect)).toBe(true);
  });

  it("beams run along the run axis when vertical (V)", () => {
    const bay: Bay = { rect: { x: 10, y: 20, w: 600, h: 300 }, beamDir: "V" };
    const { beams } = beamLayout(bay, 5, 5);
    expect(beams).toHaveLength(5);
    // V beams run along y → span the full height; thickness BEAM_WIDTH (12cm).
    for (const b of beams) {
      expect(b.h).toBe(300);
      expect(b.w).toBe(12);
      expect(within(b, bay.rect)).toBe(true);
    }
  });

  it("matches the engine counts: drawing reflects beam_count / block_rows", () => {
    const bays = decomposeToBays(rectLoop);
    const beamDir = defaultBeamDir(bays[0]);
    const input = bayToSlabInput({ rect: bays[0], beamDir });
    const result = calculateSlab(input);
    const { beams } = beamLayout({ rect: bays[0], beamDir }, result.beam_count, result.block_rows);
    expect(beams).toHaveLength(result.beam_count);
  });

  it("degenerate inputs return empty layers", () => {
    const bay: Bay = { rect: { x: 0, y: 0, w: 320, h: 500 }, beamDir: "H" };
    expect(beamLayout(bay, 0, 0)).toEqual({ beams: [], blockCells: [] });
  });
});

describe("cad geometry — GOLDEN: drawn rectangle === calculator input", () => {
  it("a drawn 3.2×5.0 bay produces the identical engine result as typing it", () => {
    const bays = decomposeToBays(rectLoop);
    const input = bayToSlabInput({ rect: bays[0], beamDir: defaultBeamDir(bays[0]) });
    // beams run along the short side (320cm) → inner_width = 3.2, inner_length = 5.0
    expect(input).toEqual({ inner_width: 3.2, inner_length: 5.0 });
    const fromDraw = calculateSlab(input);
    const fromTyping = calculateSlab({ inner_width: 3.2, inner_length: 5.0 });
    expect(fromDraw).toEqual(fromTyping);
  });
});
