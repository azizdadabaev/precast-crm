import { describe, it, expect } from "vitest";
import type { Pt } from "@/lib/cad/geometry";
import {
  computeSnap,
  DEFAULT_SNAP_SETTINGS,
  type SnapSettings,
  type SnapInput,
} from "@/lib/cad/snap";

// A square outline 0,0 → 200,0 → 200,200 → 0,200 (cm).
const SQUARE: Pt[] = [
  { x: 0, y: 0 },
  { x: 200, y: 0 },
  { x: 200, y: 200 },
  { x: 0, y: 200 },
];

/** Build a SnapInput with sane defaults; override per test. */
function makeInput(over: Partial<SnapInput> & { cursor: Pt }): SnapInput {
  return {
    points: SQUARE,
    closed: true,
    origin: null,
    excludeIndex: null,
    tolCm: 12,
    settings: DEFAULT_SNAP_SETTINGS,
    ...over,
  };
}

/** Only the named snap types on, everything else off. */
function only(...keys: (keyof SnapSettings)[]): SnapSettings {
  const s: SnapSettings = {
    ...DEFAULT_SNAP_SETTINGS,
    endpoint: false,
    midpoint: false,
    edge: false,
    perpendicular: false,
    intersection: false,
    alignment: false,
    polar: false,
    grid: false,
  };
  for (const k of keys) (s as unknown as Record<string, unknown>)[k] = true;
  return s;
}

describe("computeSnap — endpoint", () => {
  it("snaps a cursor near a vertex to that vertex with type endpoint", () => {
    const r = computeSnap(
      makeInput({ cursor: { x: 197, y: 4 }, settings: only("endpoint") }),
    );
    expect(r.type).toBe("endpoint");
    expect(r.point).toEqual({ x: 200, y: 0 });
    expect(r.guides).toEqual([]);
  });

  it("ignores the excluded vertex (the one being dragged)", () => {
    const r = computeSnap(
      makeInput({
        cursor: { x: 2, y: 2 },
        excludeIndex: 0,
        settings: only("endpoint"),
      }),
    );
    // vertex 0 excluded; nearest remaining vertex is far → no endpoint snap.
    expect(r.type).toBeNull();
  });
});

describe("computeSnap — midpoint", () => {
  it("snaps near an edge midpoint when endpoints are off", () => {
    // Midpoint of edge 0 (0,0)→(200,0) is (100,0).
    const r = computeSnap(
      makeInput({ cursor: { x: 104, y: 3 }, settings: only("midpoint") }),
    );
    expect(r.type).toBe("midpoint");
    expect(r.point).toEqual({ x: 100, y: 0 });
  });
});

describe("computeSnap — edge", () => {
  it("snaps onto the nearest edge line", () => {
    const r = computeSnap(
      makeInput({ cursor: { x: 60, y: 5 }, settings: only("edge") }),
    );
    expect(r.type).toBe("edge");
    expect(r.point).toEqual({ x: 60, y: 0 });
  });
});

describe("computeSnap — alignment", () => {
  it("snaps point.x to a vertex's x and adds a vertical guide", () => {
    // Vertex (200,0): cursor shares x≈200 but is far in y.
    const r = computeSnap(
      makeInput({
        cursor: { x: 203, y: 500 },
        settings: only("alignment"),
        tolCm: 12,
      }),
    );
    expect(r.type).toBe("alignment");
    expect(r.point.x).toBe(200);
    expect(r.point.y).toBe(500);
    expect(r.guides.length).toBeGreaterThanOrEqual(1);
    expect(r.guides[0].kind).toBe("alignment");
  });

  it("both-axis case snaps to the corner with two guides", () => {
    // Near x of vertex (200,*) AND y of vertex (*,200) → corner (200,200).
    const r = computeSnap(
      makeInput({
        cursor: { x: 204, y: 196 },
        settings: only("alignment"),
        tolCm: 12,
      }),
    );
    expect(r.type).toBe("alignment");
    expect(r.point).toEqual({ x: 200, y: 200 });
    expect(r.guides.length).toBe(2);
  });
});

describe("computeSnap — polar", () => {
  it("snaps a ~45° cursor onto an exact diagonal with polarStepDeg 45", () => {
    const r = computeSnap({
      cursor: { x: 100, y: 90 },
      points: [{ x: 0, y: 0 }],
      closed: false,
      origin: { x: 0, y: 0 },
      excludeIndex: null,
      tolCm: 12,
      settings: { ...only("polar"), polarStepDeg: 45 },
    });
    expect(r.type).toBe("polar");
    // On the 45° ray, x === y (both positive, same quadrant as cursor).
    expect(Math.abs(r.point.x - r.point.y)).toBeLessThan(1e-6);
    expect(r.point.x).toBeGreaterThan(0);
    expect(r.guides.some((g) => g.kind === "polar")).toBe(true);
  });

  it("polarStepDeg 90 snaps a near-horizontal cursor to pure horizontal", () => {
    const r = computeSnap({
      cursor: { x: 150, y: 8 },
      points: [{ x: 0, y: 0 }],
      closed: false,
      origin: { x: 0, y: 0 },
      excludeIndex: null,
      tolCm: 12,
      settings: { ...only("polar"), polarStepDeg: 90 },
    });
    expect(r.type).toBe("polar");
    expect(r.point.y).toBe(0); // origin.y
    expect(r.point.x).toBeGreaterThan(0);
  });
});

describe("computeSnap — priority", () => {
  it("an endpoint candidate beats a grid result", () => {
    const settings: SnapSettings = {
      ...DEFAULT_SNAP_SETTINGS,
      endpoint: true,
      grid: true,
      midpoint: false,
      edge: false,
      perpendicular: false,
      intersection: false,
      alignment: false,
      polar: false,
    };
    const r = computeSnap(makeInput({ cursor: { x: 198, y: 3 }, settings }));
    expect(r.type).toBe("endpoint");
    expect(r.point).toEqual({ x: 200, y: 0 });
  });
});

describe("computeSnap — grid fallback", () => {
  it("snaps to the grid when only grid is enabled", () => {
    const settings: SnapSettings = { ...only("grid"), gridStepCm: 10 };
    const r = computeSnap(makeInput({ cursor: { x: 47, y: 502 }, settings }));
    expect(r.type).toBe("grid");
    expect(r.point).toEqual({ x: 50, y: 500 });
  });

  it("returns the cursor unchanged with null type when nothing is enabled", () => {
    const settings = only(); // all off
    const r = computeSnap(makeInput({ cursor: { x: 47, y: 13 }, settings }));
    expect(r.type).toBeNull();
    expect(r.point).toEqual({ x: 47, y: 13 });
  });
});

describe("computeSnap — cross-room (extraLoops)", () => {
  // A second room sitting to the RIGHT of SQUARE, sharing the x=200 wall:
  // 200,0 → 400,0 → 400,200 → 200,200.
  const OTHER: Pt[] = [
    { x: 200, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 200 },
    { x: 200, y: 200 },
  ];

  it("snaps to another room's corner (endpoint) when extraLoops is provided", () => {
    const r = computeSnap(
      makeInput({
        cursor: { x: 403, y: 4 }, // near OTHER's top-right corner
        settings: only("endpoint"),
        extraLoops: [{ points: OTHER, closed: true }],
      }),
    );
    expect(r.type).toBe("endpoint");
    expect(r.point).toEqual({ x: 400, y: 0 });
  });

  it("does NOT snap to that corner without extraLoops (control)", () => {
    const r = computeSnap(
      makeInput({ cursor: { x: 403, y: 4 }, settings: only("endpoint") }),
    );
    // The active SQUARE has no vertex near (403,4) → no endpoint snap.
    expect(r.type).toBeNull();
  });

  it("snaps onto another room's wall (edge)", () => {
    const r = computeSnap(
      makeInput({
        cursor: { x: 300, y: 4 }, // just inside OTHER's top wall (y=0)
        settings: only("edge"),
        extraLoops: [{ points: OTHER, closed: true }],
      }),
    );
    expect(r.type).toBe("edge");
    expect(r.point).toEqual({ x: 300, y: 0 });
  });

  it("aligns the active point to another room's vertex (shared axis)", () => {
    // Cursor near x=400 (OTHER's right edge x) but far from any vertex/edge of
    // either room in y — only alignment should fire, sharing x=400.
    const r = computeSnap(
      makeInput({
        cursor: { x: 398, y: 1000 },
        settings: only("alignment"),
        extraLoops: [{ points: OTHER, closed: true }],
      }),
    );
    expect(r.type).toBe("alignment");
    expect(r.point.x).toBe(400);
  });
});

describe("computeSnap — construction guides (extraLines)", () => {
  it("snaps ONTO a guide line (edge)", () => {
    const r = computeSnap(
      makeInput({
        cursor: { x: 303, y: 50 },
        settings: only("edge"),
        extraLines: [{ a: { x: 300, y: 0 }, b: { x: 300, y: 400 } }], // vertical x=300
      }),
    );
    expect(r.type).toBe("edge");
    expect(r.point.x).toBeCloseTo(300, 6);
    expect(r.point.y).toBeCloseTo(50, 6);
  });

  it("snaps to a guide ∩ wall intersection", () => {
    // Infinite horizontal guide y=100 crosses SQUARE's left wall (x=0) at (0,100).
    const r = computeSnap(
      makeInput({
        cursor: { x: 3, y: 103 },
        settings: only("intersection"),
        extraLines: [{ a: { x: -50, y: 100 }, b: { x: 50, y: 100 } }],
      }),
    );
    expect(r.type).toBe("intersection");
    expect(r.point.x).toBeCloseTo(0, 6);
    expect(r.point.y).toBeCloseTo(100, 6);
  });

  it("snaps to a guide ∩ guide VIRTUAL intersection (no geometry there)", () => {
    const r = computeSnap(
      makeInput({
        cursor: { x: 303, y: 503 },
        settings: only("intersection"),
        extraLines: [
          { a: { x: 300, y: 0 }, b: { x: 300, y: 10 } }, // infinite vertical x=300
          { a: { x: 0, y: 500 }, b: { x: 10, y: 500 } }, // infinite horizontal y=500
        ],
      }),
    );
    expect(r.type).toBe("intersection");
    expect(r.point.x).toBeCloseTo(300, 6);
    expect(r.point.y).toBeCloseTo(500, 6);
  });

  it("no guides → no effect (control)", () => {
    const r = computeSnap(makeInput({ cursor: { x: 303, y: 50 }, settings: only("edge") }));
    expect(r.type).toBeNull();
  });
});
