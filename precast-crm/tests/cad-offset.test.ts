import { describe, it, expect } from "vitest";
import { offsetPolygonOutward, offsetPolygonInward } from "@/lib/cad/offset";
import type { Pt } from "@/lib/cad/geometry";

// Tiny shoelace helper (absolute area in cm²) so the tests don't depend on the
// geometry module's signed-area sign convention.
function area(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a / 2);
}

function bbox(pts: Pt[]) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

describe("offsetPolygonOutward — outward sign oracle (rectangle)", () => {
  // Screen y-DOWN rectangle, wound CCW in screen coords:
  // (0,0)→(400,0)→(400,300)→(0,300). Offsetting outward by 15 grows it to the
  // surrounding rectangle with each corner pushed diagonally out by 15.
  const rect: Pt[] = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 300 },
    { x: 0, y: 300 },
  ];

  it("grows the rectangle outward to exact corner coordinates", () => {
    const out = offsetPolygonOutward(rect, 15);
    expect(out).toHaveLength(4);
    expect(out[0].x).toBeCloseTo(-15, 6);
    expect(out[0].y).toBeCloseTo(-15, 6);
    expect(out[1].x).toBeCloseTo(415, 6);
    expect(out[1].y).toBeCloseTo(-15, 6);
    expect(out[2].x).toBeCloseTo(415, 6);
    expect(out[2].y).toBeCloseTo(315, 6);
    expect(out[3].x).toBeCloseTo(-15, 6);
    expect(out[3].y).toBeCloseTo(315, 6);
  });

  it("grows the SAME rectangle wound clockwise to the SAME outer rectangle (winding independence)", () => {
    const cw: Pt[] = [
      { x: 0, y: 0 },
      { x: 0, y: 300 },
      { x: 400, y: 300 },
      { x: 400, y: 0 },
    ];
    const out = offsetPolygonOutward(cw, 15);
    expect(out).toHaveLength(4);
    // Same outer rectangle, corner k aligned with input vertex k.
    expect(out[0].x).toBeCloseTo(-15, 6);
    expect(out[0].y).toBeCloseTo(-15, 6);
    expect(out[1].x).toBeCloseTo(-15, 6);
    expect(out[1].y).toBeCloseTo(315, 6);
    expect(out[2].x).toBeCloseTo(415, 6);
    expect(out[2].y).toBeCloseTo(315, 6);
    expect(out[3].x).toBeCloseTo(415, 6);
    expect(out[3].y).toBeCloseTo(-15, 6);
    // The bounding box is identical to the CCW case either way.
    const bb = bbox(out);
    expect(bb.minX).toBeCloseTo(-15, 6);
    expect(bb.maxX).toBeCloseTo(415, 6);
    expect(bb.minY).toBeCloseTo(-15, 6);
    expect(bb.maxY).toBeCloseTo(315, 6);
  });
});

describe("offsetPolygonOutward — re-entrant L-shape", () => {
  // 6-vertex L (CCW in screen y-down). Bounding box 600×700.
  const lShape: Pt[] = [
    { x: 0, y: 0 },
    { x: 600, y: 0 },
    { x: 600, y: 400 },
    { x: 300, y: 400 },
    { x: 300, y: 700 },
    { x: 0, y: 700 },
  ];

  it("grows the bounding box by exactly the offset on every side and increases area", () => {
    const d = 15;
    const before = bbox(lShape);
    const out = offsetPolygonOutward(lShape, d);
    expect(out).toHaveLength(6);
    const after = bbox(out);
    expect(after.minX).toBeCloseTo(before.minX - d, 6);
    expect(after.maxX).toBeCloseTo(before.maxX + d, 6);
    expect(after.minY).toBeCloseTo(before.minY - d, 6);
    expect(after.maxY).toBeCloseTo(before.maxY + d, 6);
    // Outward offset must grow the polygon's area (re-entrant corner included).
    expect(area(out)).toBeGreaterThan(area(lShape));
  });

  it("moves the re-entrant corner vertex so the ring beam wraps the notch correctly", () => {
    // Vertex 3 (300,400) is the re-entrant (concave) corner. Outward there means
    // the corner moves toward +x and +y (into the solid arm) so the offset loop
    // still encloses MORE area than the original.
    const out = offsetPolygonOutward(lShape, 15);
    expect(out[3].x).toBeGreaterThan(300);
    expect(out[3].y).toBeGreaterThan(400);
  });
});

describe("offsetPolygonOutward — degenerate + numeric edge cases", () => {
  it("returns a copy unchanged for fewer than 3 vertices", () => {
    const two: Pt[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const out = offsetPolygonOutward(two, 15);
    expect(out).toEqual(two);
    expect(out).not.toBe(two); // a copy, not the same reference
  });

  it("returns equal coordinates for a zero distance", () => {
    const rect: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ];
    const out = offsetPolygonOutward(rect, 0);
    expect(out).toEqual(rect);
  });

  it("does not produce NaN / Infinity on a near-collinear vertex", () => {
    // A vertex that is almost on the line between its neighbours (tiny bump):
    // the two incident edges are nearly parallel → miter would blow up without
    // the averaged-normal fallback.
    const poly: Pt[] = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 400, y: 0.0001 }, // almost collinear with the previous edge
      { x: 400, y: 300 },
      { x: 0, y: 300 },
    ];
    const out = offsetPolygonOutward(poly, 15);
    expect(out).toHaveLength(5);
    for (const p of out) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});

describe("offsetPolygonInward — clear inner wall face", () => {
  const rect: Pt[] = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 300 },
    { x: 0, y: 300 },
  ];

  it("shrinks the rectangle inward by exactly the thickness on every side", () => {
    const inner = offsetPolygonInward(rect, 20);
    expect(inner[0].x).toBeCloseTo(20, 6);
    expect(inner[0].y).toBeCloseTo(20, 6);
    expect(inner[1].x).toBeCloseTo(380, 6);
    expect(inner[2].y).toBeCloseTo(280, 6);
    // Inner clear area is the (W-2t)(H-2t) rectangle.
    expect(area(inner)).toBeCloseTo((400 - 40) * (300 - 40), 4);
    // Smaller than the outer footprint.
    expect(area(inner)).toBeLessThan(area(rect));
  });

  it("is the inverse of an outward offset by the same distance", () => {
    const inner = offsetPolygonInward(rect, 25);
    const out = offsetPolygonOutward(rect, -25);
    inner.forEach((p, i) => {
      expect(p.x).toBeCloseTo(out[i].x, 9);
      expect(p.y).toBeCloseTo(out[i].y, 9);
    });
  });
});
