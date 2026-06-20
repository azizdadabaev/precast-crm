import { describe, it, expect } from "vitest";
import {
  translatePolygon,
  rotatePolygon,
  mirrorPolygonX,
  mirrorPolygonY,
  bbox,
  type Pt,
} from "@/lib/cad/geometry";

// A 200×100 rectangle in CM, y-DOWN. bbox centre = (100, 50).
const rect = (): Pt[] => [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 200, y: 100 },
  { x: 0, y: 100 },
];

// A non-convex L-shape in CM (rectilinear). bbox = (0,0,200,200).
const lshape = (): Pt[] => [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 200, y: 100 },
  { x: 100, y: 100 },
  { x: 100, y: 200 },
  { x: 0, y: 200 },
];

/** Unsigned shoelace area (orientation-independent). */
const area = (pts: Pt[]): number => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a / 2);
};

const centre = (pts: Pt[]): Pt => {
  const b = bbox(pts);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
};

describe("translatePolygon", () => {
  it("shifts every point by exactly (dx, dy)", () => {
    const p = rect();
    const out = translatePolygon(p, 30, -15);
    out.forEach((q, i) => {
      expect(q.x).toBeCloseTo(p[i].x + 30, 9);
      expect(q.y).toBeCloseTo(p[i].y - 15, 9);
    });
  });

  it("preserves area and does not mutate the input", () => {
    const p = rect();
    const out = translatePolygon(p, 12, 34);
    expect(area(out)).toBeCloseTo(area(rect()), 6);
    expect(p).toEqual(rect()); // unchanged
  });

  it("a zero translation returns identical coordinates", () => {
    const p = lshape();
    const out = translatePolygon(p, 0, 0);
    out.forEach((q, i) => {
      expect(q.x).toBeCloseTo(p[i].x, 9);
      expect(q.y).toBeCloseTo(p[i].y, 9);
    });
  });
});

describe("rotatePolygon", () => {
  it("rotating a rectangle 90° about its bbox centre swaps width/height, keeps the centre", () => {
    const p = rect();
    const c0 = centre(p);
    const out = rotatePolygon(p, 90);
    const b = bbox(out);
    // 200×100 → 100×200 after a quarter turn.
    expect(b.w).toBeCloseTo(100, 6);
    expect(b.h).toBeCloseTo(200, 6);
    const c1 = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    expect(c1.x).toBeCloseTo(c0.x, 6);
    expect(c1.y).toBeCloseTo(c0.y, 6);
    expect(area(out)).toBeCloseTo(area(p), 6);
  });

  it("clockwise-positive: a +90° turn sends +x toward +y (down) in screen space", () => {
    // A unit vector from origin pointing +x; rotate about the origin.
    const seg: Pt[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const out = rotatePolygon(seg, 90, { x: 0, y: 0 });
    // +x (right) → +y (down) for a clockwise-positive y-down rotation.
    expect(out[1].x).toBeCloseTo(0, 6);
    expect(out[1].y).toBeCloseTo(10, 6);
  });

  it("360° rotation is (within tolerance) the identity", () => {
    const p = lshape();
    const out = rotatePolygon(p, 360);
    out.forEach((q, i) => {
      expect(q.x).toBeCloseTo(p[i].x, 6);
      expect(q.y).toBeCloseTo(p[i].y, 6);
    });
  });

  it("preserves area for an arbitrary angle about the bbox centre", () => {
    const p = lshape();
    const out = rotatePolygon(p, 37);
    expect(area(out)).toBeCloseTo(area(p), 6);
    // Centre is unchanged for a rotation about the bbox centre... but a rotated
    // bbox can grow, so only the CENTROID of the rotated points is conserved.
    const cent = (q: Pt[]): Pt => {
      const s = q.reduce((acc, r) => ({ x: acc.x + r.x, y: acc.y + r.y }), { x: 0, y: 0 });
      return { x: s.x / q.length, y: s.y / q.length };
    };
    expect(cent(out).x).toBeCloseTo(cent(p).x, 6);
    expect(cent(out).y).toBeCloseTo(cent(p).y, 6);
  });

  it("does not mutate the input", () => {
    const p = rect();
    rotatePolygon(p, 90);
    expect(p).toEqual(rect());
  });
});

describe("mirrorPolygonX / mirrorPolygonY", () => {
  it("mirrorPolygonX reflects x about the bbox centre's x", () => {
    const p = rect();
    const cx = centre(p).x;
    const out = mirrorPolygonX(p);
    out.forEach((q, i) => {
      expect(q.x).toBeCloseTo(2 * cx - p[i].x, 9);
      expect(q.y).toBeCloseTo(p[i].y, 9);
    });
  });

  it("mirrorPolygonY reflects y about the bbox centre's y", () => {
    const p = rect();
    const cy = centre(p).y;
    const out = mirrorPolygonY(p);
    out.forEach((q, i) => {
      expect(q.x).toBeCloseTo(p[i].x, 9);
      expect(q.y).toBeCloseTo(2 * cy - p[i].y, 9);
    });
  });

  it("mirroring twice (X then X, Y then Y) returns the original; area preserved", () => {
    const p = lshape();
    expect(area(mirrorPolygonX(p))).toBeCloseTo(area(p), 6);
    expect(area(mirrorPolygonY(p))).toBeCloseTo(area(p), 6);

    const backX = mirrorPolygonX(mirrorPolygonX(p));
    const backY = mirrorPolygonY(mirrorPolygonY(p));
    backX.forEach((q, i) => {
      expect(q.x).toBeCloseTo(p[i].x, 6);
      expect(q.y).toBeCloseTo(p[i].y, 6);
    });
    backY.forEach((q, i) => {
      expect(q.x).toBeCloseTo(p[i].x, 6);
      expect(q.y).toBeCloseTo(p[i].y, 6);
    });
  });

  it("accepts an explicit centre and does not mutate the input", () => {
    const p = rect();
    const outX = mirrorPolygonX(p, { x: 0, y: 0 });
    outX.forEach((q, i) => expect(q.x).toBeCloseTo(-p[i].x, 9));
    expect(p).toEqual(rect());
  });
});
