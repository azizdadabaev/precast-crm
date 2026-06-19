import { describe, it, expect } from "vitest";
import {
  polygonArea,
  bbox,
  snapOrtho,
  snapToGrid,
  defaultBeamDir,
  decomposeToBays,
  bayToSlabInput,
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
