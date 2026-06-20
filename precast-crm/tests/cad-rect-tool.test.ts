import { describe, it, expect } from "vitest";
import { rectFromCorners, type Pt } from "@/lib/cad/geometry";

// rectFromCorners builds an axis-aligned rectangle (4 CW points, closed-loop
// order) from two opposite corners, in CM, y-DOWN screen space. Order is:
//   A, (B.x, A.y), B, (A.x, B.y)  — i.e. top-left → top-right → bottom-right →
//   bottom-left for a top-left→bottom-right drag.

describe("rectFromCorners", () => {
  it("builds the 4 corners in closed-loop order for a top-left→bottom-right drag", () => {
    const a: Pt = { x: 0, y: 0 };
    const b: Pt = { x: 200, y: 100 };
    const r = rectFromCorners(a, b);
    expect(r).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 0, y: 100 },
    ]);
  });

  it("has the correct width and height (along x and y)", () => {
    const r = rectFromCorners({ x: 50, y: 30 }, { x: 250, y: 180 });
    expect(r).toHaveLength(4);
    const xs = r.map((p) => p.x);
    const ys = r.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(200); // width
    expect(Math.max(...ys) - Math.min(...ys)).toBe(150); // height
  });

  it("normalizes reversed (negative) corners to the same rectangle", () => {
    const forward = rectFromCorners({ x: 0, y: 0 }, { x: 200, y: 100 });
    const reversed = rectFromCorners({ x: 200, y: 100 }, { x: 0, y: 0 });
    // Same set of 4 corner coordinates regardless of drag direction.
    const sortKey = (p: Pt) => `${p.x},${p.y}`;
    expect(reversed.map(sortKey).sort()).toEqual(forward.map(sortKey).sort());
  });

  it("keeps the rect axis-aligned when the second corner is up-left of the first", () => {
    const r = rectFromCorners({ x: 100, y: 100 }, { x: 0, y: 0 });
    const xs = new Set(r.map((p) => p.x));
    const ys = new Set(r.map((p) => p.y));
    expect(xs).toEqual(new Set([0, 100]));
    expect(ys).toEqual(new Set([0, 100]));
  });

  it("returns [] for a degenerate rectangle (zero / sub-min width or height)", () => {
    expect(rectFromCorners({ x: 0, y: 0 }, { x: 0, y: 100 })).toEqual([]); // zero width
    expect(rectFromCorners({ x: 0, y: 0 }, { x: 100, y: 0 })).toEqual([]); // zero height
    expect(rectFromCorners({ x: 0, y: 0 }, { x: 0.5, y: 100 })).toEqual([]); // sub-min width
  });

  it("respects a custom minCm threshold", () => {
    // 3cm wide: degenerate at minCm=5, valid at the default 1cm.
    expect(rectFromCorners({ x: 0, y: 0 }, { x: 3, y: 100 }, 5)).toEqual([]);
    expect(rectFromCorners({ x: 0, y: 0 }, { x: 3, y: 100 })).toHaveLength(4);
  });
});
