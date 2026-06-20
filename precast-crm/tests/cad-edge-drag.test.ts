import { describe, it, expect } from "vitest";
import {
  moveEdgeParallel,
  edgeDragOffset,
  edgeOutwardNormal,
  bbox,
  type Pt,
} from "@/lib/cad/geometry";

// A unit-ish square in CM, y-DOWN, wound clockwise on screen:
//   v0 (0,0) ── v1 (100,0)      edge 0 = TOP    (outward = up,    {0,-1})
//      │             │          edge 1 = RIGHT  (outward = right, {1, 0})
//   v3 (0,100) ─ v2 (100,100)   edge 2 = BOTTOM (outward = down,  {0, 1})
//                               edge 3 = LEFT   (outward = left,  {-1,0})
const square = (): Pt[] => [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

const dir = (a: Pt, b: Pt): Pt => {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
};

describe("edgeOutwardNormal (sanity on the test square)", () => {
  it("points outward for each cardinal edge", () => {
    const p = square();
    const close = (n: Pt, x: number, y: number) => {
      expect(n.x).toBeCloseTo(x, 6);
      expect(n.y).toBeCloseTo(y, 6);
    };
    close(edgeOutwardNormal(p, 0), 0, -1); // top → up
    close(edgeOutwardNormal(p, 1), 1, 0); // right → right
    close(edgeOutwardNormal(p, 2), 0, 1); // bottom → down
    close(edgeOutwardNormal(p, 3), -1, 0); // left → left
  });
});

describe("moveEdgeParallel", () => {
  it("moving the TOP edge outward by 50 increases box height by 50", () => {
    const p0 = square();
    const before = bbox(p0);
    const next = moveEdgeParallel(p0, 0, 50, true);
    const after = bbox(next);
    expect(after.h).toBeCloseTo(before.h + 50, 6);
    expect(after.w).toBeCloseTo(before.w, 6); // width unchanged
  });

  it("keeps the moved (top) edge axis-aligned and parallel", () => {
    const p0 = square();
    const before = dir(p0[0], p0[1]);
    const next = moveEdgeParallel(p0, 0, 50, true);
    const after = dir(next[0], next[1]);
    // Same direction vector → still parallel.
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    // Axis-aligned: both endpoints share the same y.
    expect(next[0].y).toBeCloseTo(next[1].y, 6);
  });

  it("moving a SIDE edge changes the width, not the height", () => {
    const p0 = square();
    const before = bbox(p0);
    const next = moveEdgeParallel(p0, 1, 30, true); // right edge outward
    const after = bbox(next);
    expect(after.w).toBeCloseTo(before.w + 30, 6);
    expect(after.h).toBeCloseTo(before.h, 6);
  });

  it("the side edge stays parallel (same direction vector)", () => {
    const p0 = square();
    const before = dir(p0[1], p0[2]); // right edge direction
    const next = moveEdgeParallel(p0, 1, 30, true);
    const after = dir(next[1], next[2]);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(next[1].x).toBeCloseTo(next[2].x, 6); // both endpoints share x
  });

  it("a NEGATIVE offset moves the edge inward (shrinks the box)", () => {
    const p0 = square();
    const before = bbox(p0);
    const next = moveEdgeParallel(p0, 0, -20, true); // top edge inward
    const after = bbox(next);
    expect(after.h).toBeCloseTo(before.h - 20, 6);
  });

  it("only the two endpoints of the dragged edge move; the rest stay put", () => {
    const p0 = square();
    const next = moveEdgeParallel(p0, 0, 50, true);
    // Edge 0 endpoints (v0, v1) moved; v2, v3 unchanged.
    expect(next[2]).toMatchObject(p0[2]);
    expect(next[3]).toMatchObject(p0[3]);
  });

  it("does not mutate the input array", () => {
    const p0 = square();
    const snapshot = JSON.stringify(p0);
    moveEdgeParallel(p0, 0, 50, true);
    expect(JSON.stringify(p0)).toBe(snapshot);
  });
});

describe("edgeDragOffset", () => {
  it("returns the signed projection of the cursor delta onto the outward normal", () => {
    const p0 = square();
    // Top edge outward is {0,-1}. Dragging UP (delta y = -40) → +40 outward.
    expect(edgeDragOffset(p0, 0, { x: 0, y: -40 }, true)).toBeCloseTo(40, 6);
    // Dragging DOWN (delta y = +40) → -40 (inward).
    expect(edgeDragOffset(p0, 0, { x: 0, y: 40 }, true)).toBeCloseTo(-40, 6);
    // Sideways drag has zero component along the top edge's normal.
    expect(edgeDragOffset(p0, 0, { x: 75, y: 0 }, true)).toBeCloseTo(0, 6);
  });

  it("sign matches outward for a side edge", () => {
    const p0 = square();
    // Right edge outward is {1,0}. Dragging RIGHT (+x) is outward → positive.
    expect(edgeDragOffset(p0, 1, { x: 25, y: 0 }, true)).toBeCloseTo(25, 6);
  });

  it("round-trips: offset then moveEdgeParallel reproduces the drag distance", () => {
    const p0 = square();
    const delta = { x: 12, y: -33 }; // arbitrary cursor drag
    const off = edgeDragOffset(p0, 0, delta, true);
    const next = moveEdgeParallel(p0, 0, off, true);
    // The top edge moved outward (up) by exactly `off` along its normal {0,-1}.
    expect(next[0].y).toBeCloseTo(p0[0].y - off, 6);
    expect(next[1].y).toBeCloseTo(p0[1].y - off, 6);
  });
});
