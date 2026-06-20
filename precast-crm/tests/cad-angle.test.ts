import { describe, it, expect } from "vitest";
import {
  edgeBearingDeg,
  setEdgeBearing,
  interiorAngleDeg,
  type Pt,
} from "@/lib/cad/geometry";

// A 100×100 square in CM, y-DOWN, wound clockwise on screen:
//   v0 (0,0) ── v1 (100,0)      edge 0 = TOP    bearing  0   (→ +x)
//      │             │          edge 1 = RIGHT  bearing  90  (↓ +y)
//   v3 (0,100) ─ v2 (100,100)   edge 2 = BOTTOM bearing 180  (← −x)
//                               edge 3 = LEFT   bearing −90  (↑ −y)
const square = (): Pt[] => [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

// A right-trapezoid: bottom-left & bottom-right are square; the top edge slants.
//   v0 (0,0) ───────── v1 (200,0)
//      │                    \
//   v3 (0,100) ─────────── v2 (100,100)
// edge 1 (v1→v2): from (200,0) to (100,100): dx=-100, dy=100 → bearing 135°.
const trapezoid = (): Pt[] => [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);
const edgeLen = (p: Pt[], i: number) => {
  const a = p[i];
  const b = p[(i + 1) % p.length];
  return Math.hypot(b.x - a.x, b.y - a.y);
};

describe("edgeBearingDeg (square)", () => {
  it("gives the cardinal bearings {0, 90, 180, −90}", () => {
    const p = square();
    near(edgeBearingDeg(p, 0, true), 0);
    near(edgeBearingDeg(p, 1, true), 90);
    near(edgeBearingDeg(p, 2, true), 180);
    near(edgeBearingDeg(p, 3, true), -90);
  });
});

describe("edgeBearingDeg (trapezoid slanted edge)", () => {
  it("returns 135° for the down-left chamfer", () => {
    near(edgeBearingDeg(trapezoid(), 1, true), 135);
  });
});

describe("interiorAngleDeg (square)", () => {
  it("is ≈ 90 at every corner", () => {
    const p = square();
    for (let i = 0; i < 4; i++) near(interiorAngleDeg(p, i), 90, 1e-4);
  });
});

describe("interiorAngleDeg (trapezoid)", () => {
  it("matches the hand-computed corner angles", () => {
    const p = trapezoid();
    // v0: edges left(v3→v0, ↑) and top(v0→v1, →) → square corner.
    near(interiorAngleDeg(p, 0), 90, 1e-4);
    // v3: square corner too.
    near(interiorAngleDeg(p, 3), 90, 1e-4);
    // v1 (200,0): vectors to v0 (−1,0) and to v2 (−100,100)→(−1,1)/√2.
    // angle = 45°.
    near(interiorAngleDeg(p, 1), 45, 1e-4);
    // v2 (100,100): vectors to v1 (100,−100)→(1,−1)/√2 and to v3 (−1,0).
    // angle = 135°.
    near(interiorAngleDeg(p, 2), 135, 1e-4);
  });

  it("interior angles sum to (n−2)·180 = 360", () => {
    const p = trapezoid();
    const sum = p.reduce((s, _, i) => s + interiorAngleDeg(p, i), 0);
    near(sum, 360, 1e-3);
  });
});

describe("interiorAngleDeg (L-shape re-entrant corner)", () => {
  it("reports the notch corner as a 270° reflex angle", () => {
    // An L-shape (CW on screen). The inner corner v? is re-entrant.
    //   (0,0) ── (200,0)
    //     │          │
    //     │       (200,100) ── (100,100)
    //     │                        │
    //   (0,200) ───────────────(100,200)
    const L: Pt[] = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 100, y: 100 }, // re-entrant (reflex) corner
      { x: 100, y: 200 },
      { x: 0, y: 200 },
    ];
    near(interiorAngleDeg(L, 3), 270, 1e-4);
    // sum of interior angles = (n−2)·180 = 720
    const sum = L.reduce((s, _, i) => s + interiorAngleDeg(L, i), 0);
    near(sum, 720, 1e-3);
  });
});

describe("setEdgeBearing", () => {
  it("rotates edge to the requested bearing and preserves its length", () => {
    const p = trapezoid();
    const len1 = edgeLen(p, 1);
    const next = setEdgeBearing(p, 1, 100, true);
    near(edgeBearingDeg(next, 1, true), 100);
    near(edgeLen(next, 1), len1);
  });

  it("keeps the START vertex fixed and moves only the END vertex", () => {
    const p = square();
    const next = setEdgeBearing(p, 0, 30, true);
    // start vertex v0 unchanged
    near(next[0].x, p[0].x);
    near(next[0].y, p[0].y);
    // end vertex v1 moved off the original
    expect(Math.hypot(next[1].x - p[1].x, next[1].y - p[1].y)).toBeGreaterThan(1);
    // the non-incident vertices (v2, v3) stay put
    near(next[2].x, p[2].x);
    near(next[2].y, p[2].y);
    near(next[3].x, p[3].x);
    near(next[3].y, p[3].y);
  });

  it("is a no-op on the open-loop closing edge", () => {
    const open = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    const next = setEdgeBearing(open, 2, 45, false); // edge 2 = closing edge, doesn't exist
    expect(next).toEqual(open);
  });

  it("a 180−bearing mirror flips a right-leaning chamfer to left-leaning", () => {
    const p = trapezoid();
    const b = edgeBearingDeg(p, 1, true); // 135
    const next = setEdgeBearing(p, 1, 180 - b, true); // 45
    near(edgeBearingDeg(next, 1, true), 45);
    near(edgeLen(next, 1), edgeLen(p, 1)); // length preserved
  });

  it("rejects an out-of-range / degenerate edge index gracefully", () => {
    const p = square();
    expect(setEdgeBearing(p, -1, 10, true)).toEqual(p);
    expect(setEdgeBearing(p, 99, 10, true)).toEqual(p);
  });
});
