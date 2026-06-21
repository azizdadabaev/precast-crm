import { describe, it, expect } from "vitest";
import { solveConstraints, rectify, type Constraint } from "@/lib/cad/constraints";
import type { Pt } from "@/lib/cad/geometry";

const edgeVec = (pts: Pt[], e: number): Pt => {
  const n = pts.length;
  return { x: pts[(e + 1) % n].x - pts[e].x, y: pts[(e + 1) % n].y - pts[e].y };
};
const edgeLen = (pts: Pt[], e: number) => {
  const v = edgeVec(pts, e);
  return Math.hypot(v.x, v.y);
};

describe("solveConstraints", () => {
  it("horizontal makes an edge's endpoints share a y", () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 6 }, // edge 0 slightly off horizontal
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const out = solveConstraints(pts, [{ type: "horizontal", edge: 0 }]);
    expect(Math.abs(out[0].y - out[1].y)).toBeLessThan(0.01);
  });

  it("vertical makes an edge's endpoints share an x", () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 8, y: 100 }, // edge 0 slightly off vertical
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const out = solveConstraints(pts, [{ type: "vertical", edge: 0 }]);
    expect(Math.abs(out[0].x - out[1].x)).toBeLessThan(0.01);
  });

  it("equal converges the two edges to the same length", () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 }, // edge0 len 100
      { x: 100, y: 80 }, // edge1 len 80
      { x: 0, y: 80 },
    ];
    const out = solveConstraints(pts, [{ type: "equal", edges: [0, 1] }]);
    expect(Math.abs(edgeLen(out, 0) - edgeLen(out, 1))).toBeLessThan(1);
  });

  it("perpendicular drives the dot product of two edges to ~0", () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 10 }, // edge0
      { x: 80, y: 110 }, // edge1 (not quite perpendicular to edge0)
      { x: 0, y: 100 },
    ];
    const out = solveConstraints(pts, [{ type: "perpendicular", edges: [0, 1] }], [], 60);
    const v0 = edgeVec(out, 0);
    const v1 = edgeVec(out, 1);
    const cos = (v0.x * v1.x + v0.y * v1.y) / (Math.hypot(v0.x, v0.y) * Math.hypot(v1.x, v1.y));
    expect(Math.abs(cos)).toBeLessThan(0.02);
  });

  it("a pinned vertex never moves", () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 9 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const out = solveConstraints(pts, [{ type: "horizontal", edge: 0 }], [0]);
    expect(out[0]).toEqual({ x: 0, y: 0 }); // pinned
  });
});

describe("rectify", () => {
  it("squares up a near-rectilinear quad to axis-aligned edges", () => {
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 4 },
      { x: 97, y: 100 },
      { x: 3, y: 98 },
    ];
    const out = rectify(pts);
    // Every edge ends up essentially horizontal or vertical (minor axis ≈ 0).
    const n = out.length;
    for (let e = 0; e < n; e++) {
      const dx = Math.abs(out[(e + 1) % n].x - out[e].x);
      const dy = Math.abs(out[(e + 1) % n].y - out[e].y);
      expect(Math.min(dx, dy)).toBeLessThan(1);
    }
  });
});
