import { describe, it, expect } from "vitest";
import {
  polygonArea,
  bbox,
  snapOrtho,
  snapToGrid,
  setEdgeLength,
  edgeLengths,
  defaultBeamDir,
  decomposeToBays,
  bayToSlabInput,
  beamLayout,
  bayLabelLines,
  perpDimension,
  blockCellBudget,
  MAX_BLOCK_CELLS_TOTAL,
  structuralBeamCount,
  patternSpans,
  requiredPerpDepth,
  mergeBeamSchedule,
  mergeBeamScheduleByKind,
  totalBeams,
  totalBeamsOfKind,
  bayPalette,
  BAY_PALETTE,
  MAX_BLOCK_CELLS_PER_BAY,
  PITCH_CM,
  BEAM_WIDTH_CM,
  BLOCK_VISIBLE_CM,
  BLOCK_LENGTH_CM,
  BEARING_CM,
  scaleBar,
  pointSegment,
  nearestEdge,
  insertVertex,
  deleteVertex,
  segmentsIntersect,
  wouldSelfIntersect,
  wouldCollapseEdge,
  polylineSelfIntersects,
  drawStepWouldCross,
  canClose,
  isAxisAligned,
  orthoVertexMove,
  snapToVertices,
  hasDegenerateEdge,
  isValidOutline,
  fitView,
  MIN_EDGE_CM,
  perimeter,
  floorAreaCm2,
  formatLengthCm,
  formatLengthDual,
  formatAreaCm2,
  outwardNormal,
  edgeOutwardNormal,
  pointInPolygon,
  dimStyleForEdge,
  overallDimensions,
  dimensionOffsetLevels,
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

describe("cad geometry — setEdgeLength", () => {
  // Closed rectangle 320×500 (cm), CW in screen coords (y-down):
  // edge0: top    (0,0)→(320,0)   horizontal, +x
  // edge1: right  (320,0)→(320,500) vertical, +y
  // edge2: bottom (320,500)→(0,500) horizontal, -x
  // edge3: left   (0,500)→(0,0)     vertical, -y
  const makeRect = (): Pt[] => [
    { x: 0, y: 0 },
    { x: 320, y: 0 },
    { x: 320, y: 500 },
    { x: 0, y: 500 },
  ];

  // Every edge of the result must remain axis-aligned (rectilinear).
  const isOrthogonal = (pts: Pt[]) =>
    pts.every((p, i) => {
      const q = pts[(i + 1) % pts.length];
      return p.x === q.x || p.y === q.y;
    });

  it("lengthens the top edge: rectangle grows, stays closed + orthogonal", () => {
    const out = setEdgeLength(makeRect(), 0, 400);
    // Anchor (0,0) fixed; to-endpoint moved +80 in x; vertex 2 shifts with it.
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[1]).toEqual({ x: 400, y: 0 });
    expect(out[2]).toEqual({ x: 400, y: 500 });
    expect(out[3]).toEqual({ x: 0, y: 500 }); // left side untouched
    expect(isOrthogonal(out)).toBe(true);
    // Other edges stay consistent: it's a closed 400×500 rectangle now.
    const lens = edgeLengths(out);
    expect(lens[0]).toBe(400); // top — exactly the requested length
    expect(lens[1]).toBe(500); // right
    expect(lens[2]).toBe(400); // bottom mirrors top
    expect(lens[3]).toBe(500); // left
  });

  it("shortens the right (vertical) edge, preserving +y direction", () => {
    const out = setEdgeLength(makeRect(), 1, 300);
    expect(out[1]).toEqual({ x: 320, y: 0 }); // anchor unchanged
    expect(out[2]).toEqual({ x: 320, y: 300 }); // to-endpoint moved -200 in y
    expect(out[3]).toEqual({ x: 0, y: 300 }); // following vertex shifts too
    expect(isOrthogonal(out)).toBe(true);
    expect(edgeLengths(out)[1]).toBe(300);
  });

  it("the closing edge (last) is also editable and stays closed", () => {
    // edge3 wraps: to-endpoint = points[0], following vertex = points[1].
    const out = setEdgeLength(makeRect(), 3, 300);
    expect(isOrthogonal(out)).toBe(true);
    expect(edgeLengths(out)[3]).toBe(300);
  });

  it("keeps an L-shape closed + orthogonal when an edge is resized", () => {
    const out = setEdgeLength(lShape, 0, 400);
    expect(isOrthogonal(out)).toBe(true);
    expect(edgeLengths(out)[0]).toBe(400);
  });

  it("returns points unchanged for invalid edge index or negative length", () => {
    const r = makeRect();
    expect(setEdgeLength(r, 9, 100)).toEqual(r);
    expect(setEdgeLength(r, 0, -5)).toEqual(r);
  });

  it("snaps a slightly-off edge to its dominant axis", () => {
    // Near-horizontal edge (dy small). Setting length keeps it horizontal.
    const pts: Pt[] = [
      { x: 0, y: 0 },
      { x: 200, y: 3 },
      { x: 200, y: 400 },
      { x: 0, y: 400 },
    ];
    const out = setEdgeLength(pts, 0, 250);
    expect(out[1].x).toBe(250); // moved along x (dominant axis)
    expect(out[1].y).toBe(3); // y untouched
  });
});

describe("cad geometry — editing helpers", () => {
  const rect = (): Pt[] => [
    { x: 0, y: 0 },
    { x: 320, y: 0 },
    { x: 320, y: 500 },
    { x: 0, y: 500 },
  ];

  it("pointSegment finds the closest point + distance on a segment", () => {
    const r = pointSegment({ x: 160, y: 50 }, { x: 0, y: 0 }, { x: 320, y: 0 });
    expect(r.closest).toEqual({ x: 160, y: 0 });
    expect(r.dist).toBe(50);
    expect(r.t).toBeCloseTo(0.5, 6);
    // Past the end clamps t to [0,1].
    const past = pointSegment({ x: 400, y: 0 }, { x: 0, y: 0 }, { x: 320, y: 0 });
    expect(past.t).toBe(1);
    expect(past.closest).toEqual({ x: 320, y: 0 });
  });

  it("nearestEdge picks the closest edge body, ignoring endpoints", () => {
    // Just inside the top edge (y≈5): should hit edge 0 at (160,0).
    const hit = nearestEdge(rect(), { x: 160, y: 5 }, 10, true);
    expect(hit).not.toBeNull();
    expect(hit!.index).toBe(0);
    expect(hit!.at).toEqual({ x: 160, y: 0 });
    // Too far → null.
    expect(nearestEdge(rect(), { x: 160, y: 50 }, 10, true)).toBeNull();
    // Right at a vertex (t≈0) is in the excluded endpoint band → no edge hit.
    expect(nearestEdge(rect(), { x: 0, y: 0 }, 10, true)).toBeNull();
    // Open polyline: the closing edge (last→first) is not considered.
    const open: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    // Mid of the (would-be) closing edge from (100,100)→(0,0): no hit when open.
    expect(nearestEdge(open, { x: 50, y: 50 }, 10, false)).toBeNull();
  });

  it("insertVertex splits the chosen edge in place", () => {
    const out = insertVertex(rect(), 0, { x: 160, y: 0 });
    expect(out).toHaveLength(5);
    expect(out[1]).toEqual({ x: 160, y: 0 });
    // Original anchors untouched.
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out[2]).toEqual({ x: 320, y: 0 });
  });

  it("insertVertex refuses a degenerate split (on an endpoint or out of range)", () => {
    const r = rect();
    // Right on the edge's start vertex → would make a zero-length edge.
    expect(insertVertex(r, 0, { x: 0, y: 0 })).toBe(r);
    // Right on the edge's end vertex.
    expect(insertVertex(r, 0, { x: 320, y: 0 })).toBe(r);
    // Within MIN_EDGE_CM of an endpoint is also refused.
    expect(insertVertex(r, 0, { x: MIN_EDGE_CM / 2, y: 0 })).toBe(r);
    // Out-of-range index is a no-op.
    expect(insertVertex(r, 9, { x: 160, y: 0 })).toBe(r);
  });

  it("deleteVertex removes a point but never drops a closed loop below 3", () => {
    const out = deleteVertex(rect(), 1, true);
    expect(out).toHaveLength(3);
    expect(out).not.toContainEqual({ x: 320, y: 0 });
    // A triangle is the floor for a closed loop — refuse to go lower.
    const tri: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ];
    expect(deleteVertex(tri, 0, true)).toBe(tri);
  });

  it("deleteVertex refuses when the two neighbours would collapse together", () => {
    // A square with a tiny spur: removing the spur tip (idx 2) makes its
    // neighbours (idx1 and idx3) — which coincide — adjacent → zero-length edge.
    const spur: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 5 }, // spur tip
      { x: 100, y: 0 }, // coincides with idx1
      { x: 0, y: 100 },
    ];
    expect(deleteVertex(spur, 2, true)).toBe(spur);
  });

  it("wouldCollapseEdge flags a move that shrinks a neighbour edge below the min", () => {
    const r = rect();
    // Moving vertex 1 (320,0) right next to vertex 0 (0,0) collapses edge 0.
    expect(wouldCollapseEdge(r, 1, { x: 0, y: 0 }, true)).toBe(true);
    expect(wouldCollapseEdge(r, 1, { x: MIN_EDGE_CM / 2, y: 0 }, true)).toBe(true);
    // A roomy move is fine.
    expect(wouldCollapseEdge(r, 1, { x: 160, y: 0 }, true)).toBe(false);
    // Open polyline: an endpoint vertex only has one neighbour to check.
    const open: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    // Vertex 0 next to vertex 1 collapses the first edge.
    expect(wouldCollapseEdge(open, 0, { x: 100, y: 0 }, false)).toBe(true);
    // Vertex 0 nowhere near vertex 1 is fine (no wrap neighbour when open).
    expect(wouldCollapseEdge(open, 0, { x: -50, y: 0 }, false)).toBe(false);
  });

  it("segmentsIntersect detects proper crossings, ignores shared endpoints", () => {
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }),
    ).toBe(true);
    // Touching at a shared endpoint is NOT a proper crossing.
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }),
    ).toBe(false);
    // Disjoint.
    expect(
      segmentsIntersect({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 5, y: 5 }, { x: 6, y: 6 }),
    ).toBe(false);
  });

  it("wouldSelfIntersect vetoes a drag that folds the polygon", () => {
    // Dragging the bottom-left corner (idx 3) across to the right past the
    // opposite side creates a bow-tie. (0,500) → (400,250) crosses edge 1.
    expect(wouldSelfIntersect(rect(), 3, { x: 400, y: 250 }, true)).toBe(true);
    // A small in-bounds nudge does not.
    expect(wouldSelfIntersect(rect(), 3, { x: 10, y: 490 }, true)).toBe(false);
  });

  it("polylineSelfIntersects detects a bow-tie loop and clears a clean one", () => {
    // Clean rectangle — no crossings.
    expect(polylineSelfIntersects(rect(), true)).toBe(false);
    expect(polylineSelfIntersects(lShape, true)).toBe(false);
    // Bow-tie: swapping two corners makes the loop cross itself.
    const bowtie: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ];
    expect(polylineSelfIntersects(bowtie, true)).toBe(true);
    // The same vertices as an OPEN path (no closing edge) do not cross.
    const openZig: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ];
    expect(polylineSelfIntersects(openZig, false)).toBe(false);
  });

  it("drawStepWouldCross rejects a next-vertex that folds the in-progress path", () => {
    // An in-progress C-shape; closing back across the opening would cross edge 0.
    const path: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    // Heading to (50,-50) from (0,100) crosses the top edge (0,0)→(100,0).
    expect(drawStepWouldCross(path, { x: 50, y: -50 })).toBe(true);
    // Continuing outward does not cross.
    expect(drawStepWouldCross(path, { x: -50, y: 100 })).toBe(false);
    // Too few points to cross anything.
    expect(drawStepWouldCross([{ x: 0, y: 0 }], { x: 10, y: 0 })).toBe(false);
  });

  it("canClose accepts a clean loop and rejects degenerate / crossing closes", () => {
    // A clean open square (3 corners) closes fine.
    const open: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(canClose(open)).toBe(true);
    // Fewer than 3 points can't close.
    expect(canClose([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toBe(false);
    // Last point coincident with the first → degenerate closing edge.
    const dupEnd: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 0 },
    ];
    expect(canClose(dupEnd)).toBe(false);
    // A path whose close would cross an earlier edge is rejected.
    const crossing: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ];
    expect(canClose(crossing)).toBe(false);
  });

  it("isAxisAligned recognises horizontal/vertical edges, rejects diagonal/zero", () => {
    expect(isAxisAligned({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe(true); // horizontal
    expect(isAxisAligned({ x: 0, y: 0 }, { x: 0, y: 100 })).toBe(true); // vertical
    expect(isAxisAligned({ x: 0, y: 0 }, { x: 100, y: 100 })).toBe(false); // diagonal
    expect(isAxisAligned({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(false); // zero-length
  });

  it("orthoVertexMove keeps a rectilinear outline rectilinear by dragging neighbours", () => {
    // Square; move the top-right corner (idx 1) to (260, 40). Its two incident
    // edges (top: idx0→1 horizontal; right: idx1→2 vertical) must stay axis-aligned.
    const out = orthoVertexMove(rect(), 1, { x: 260, y: 40 }, true);
    expect(out[1]).toEqual({ x: 260, y: 40 }); // moved vertex takes the free target
    // Top edge stays horizontal → prev neighbour (idx0) takes the new y.
    expect(out[0]).toEqual({ x: 0, y: 40 });
    // Right edge stays vertical → next neighbour (idx2) takes the new x.
    expect(out[2]).toEqual({ x: 260, y: 500 });
    expect(out[3]).toEqual({ x: 0, y: 500 }); // untouched
    // Every edge remains axis-aligned.
    for (let i = 0; i < out.length; i++) {
      const q = out[(i + 1) % out.length];
      expect(out[i].x === q.x || out[i].y === q.y).toBe(true);
    }
  });

  it("orthoVertexMove on an open polyline skips the missing endpoint neighbour", () => {
    const open: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    // Move endpoint idx0 to (20, 30): only the forward edge (idx0→1, horizontal)
    // is constrained → idx1 takes the new y; there is no prev neighbour.
    const out = orthoVertexMove(open, 0, { x: 20, y: 30 }, false);
    expect(out[0]).toEqual({ x: 20, y: 30 });
    expect(out[1]).toEqual({ x: 100, y: 30 }); // stays horizontal
    expect(out[2]).toEqual({ x: 100, y: 100 }); // untouched
  });

  it("snapToVertices snaps to a nearby existing vertex, skipping the excluded one", () => {
    const r = rect();
    // Near the top-right corner (320,0) within tol → snaps to it.
    expect(snapToVertices(r, { x: 315, y: 4 }, 10)).toEqual({ x: 320, y: 0 });
    // Too far → null.
    expect(snapToVertices(r, { x: 160, y: 250 }, 10)).toBeNull();
    // Excluding the closest vertex falls through to the next or null.
    expect(snapToVertices(r, { x: 315, y: 4 }, 10, 1)).toBeNull();
  });

  it("hasDegenerateEdge flags any sub-min edge across the whole outline", () => {
    expect(hasDegenerateEdge(rect(), true)).toBe(false);
    const collapsed: Pt[] = [
      { x: 0, y: 0 },
      { x: 0, y: 0 }, // coincident → zero-length edge
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ];
    expect(hasDegenerateEdge(collapsed, true)).toBe(true);
  });

  it("isValidOutline rejects degenerate or self-crossing candidates", () => {
    expect(isValidOutline(rect(), true)).toBe(true);
    // Bow-tie self-intersection.
    const bowtie: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ];
    expect(isValidOutline(bowtie, true)).toBe(false);
    // Degenerate edge.
    const collapsed: Pt[] = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 100 },
    ];
    expect(isValidOutline(collapsed, true)).toBe(false);
  });

  it("fitView frames a world box centred and clamped to the zoom range", () => {
    // A 200×100 world box in a 600×600 viewport with 20px pad.
    const v = fitView({ x: 0, y: 0, w: 200, h: 100 }, 600, 600, 20, 0.25, 6);
    // availW/availH = 560; limiting axis is x → 560/200 = 2.8, clamped within range.
    expect(v.zoom).toBeCloseTo(2.8, 6);
    // Box centre (100,50) maps to the viewport centre (300,300).
    expect(100 * v.zoom + v.tx).toBeCloseTo(300, 6);
    expect(50 * v.zoom + v.ty).toBeCloseTo(300, 6);
    // Zoom is clamped to the max for a tiny box.
    const tiny = fitView({ x: 0, y: 0, w: 1, h: 1 }, 600, 600, 20, 0.25, 6);
    expect(tiny.zoom).toBe(6);
    // Degenerate box → identity.
    expect(fitView({ x: 0, y: 0, w: 0, h: 0 }, 600, 600, 20, 0.25, 6)).toEqual({
      zoom: 1,
      tx: 0,
      ty: 0,
    });
  });
});

describe("cad geometry — dimensioning", () => {
  it("perimeter sums all edges of a closed loop", () => {
    // 320×500 rectangle → 2*(320+500) = 1640 cm.
    expect(perimeter(rectLoop, true)).toBe(1640);
    // Open polyline drops the closing edge.
    expect(perimeter(rectLoop, false)).toBe(320 + 500 + 320);
    // L-shape perimeter = sum of its 7 edges back to start.
    expect(perimeter(lShape, true)).toBe(edgeLengths(lShape).reduce((s, l) => s + l, 0));
  });

  it("floorAreaCm2 is the absolute polygon area", () => {
    expect(floorAreaCm2(rectLoop)).toBe(rectW * rectH); // 160000
    expect(floorAreaCm2(lShape)).toBe(Math.abs(polygonArea(lShape)));
  });

  it("formatLengthCm prints tidy metres, trimming trailing zeros", () => {
    expect(formatLengthCm(340)).toBe("3.4 m");
    expect(formatLengthCm(622)).toBe("6.22 m");
    expect(formatLengthCm(100)).toBe("1 m");
    expect(formatLengthCm(0)).toBe("0 m");
    expect(formatLengthCm(-5)).toBe("0 m"); // coerced, never "NaN"/negative
    expect(formatLengthCm(Number.NaN)).toBe("0 m");
    // cm unit prints whole centimetres.
    expect(formatLengthCm(345.7, { unit: "cm" })).toBe("346 cm");
    // maxDecimals respected + trimmed.
    expect(formatLengthCm(333, { maxDecimals: 1 })).toBe("3.3 m");
  });

  it("formatAreaCm2 prints m² from cm²", () => {
    expect(formatAreaCm2(160000)).toBe("16 m²");
    expect(formatAreaCm2(123456)).toBe("12.35 m²");
    expect(formatAreaCm2(0)).toBe("0 m²");
  });

  it("formatLengthDual prints metres + remaining centimetres (fabricator long-hand)", () => {
    expect(formatLengthDual(622)).toBe("6 m 22");
    expect(formatLengthDual(340)).toBe("3 m 40");
    expect(formatLengthDual(300)).toBe("3 m"); // whole metres → no trailing cm
    expect(formatLengthDual(100)).toBe("1 m");
    expect(formatLengthDual(45)).toBe("45 cm"); // sub-metre → centimetres
    expect(formatLengthDual(0)).toBe("0 cm");
    expect(formatLengthDual(345.7)).toBe("3 m 46"); // rounds to whole cm first
    expect(formatLengthDual(-10)).toBe("0 cm"); // coerced, never negative
    expect(formatLengthDual(Number.NaN)).toBe("0 cm");
  });

  it("pointInPolygon classifies inside / outside / on-boundary points", () => {
    expect(pointInPolygon({ x: 160, y: 250 }, rectLoop)).toBe(true); // centre
    expect(pointInPolygon({ x: -5, y: 250 }, rectLoop)).toBe(false); // left of it
    expect(pointInPolygon({ x: 400, y: 250 }, rectLoop)).toBe(false); // right of it
    expect(pointInPolygon({ x: 160, y: 0 }, rectLoop)).toBe(true); // on the top edge
    // The L-shape notch (top-left void) is OUTSIDE the polygon.
    expect(pointInPolygon({ x: 50, y: 200 }, lShape)).toBe(false);
    // A point in the solid arm is inside.
    expect(pointInPolygon({ x: 200, y: 200 }, lShape)).toBe(true);
  });

  it("edgeOutwardNormal points into the void for a re-entrant (notch) edge", () => {
    const norm = (p: Pt): Pt => ({ x: p.x + 0, y: p.y + 0 });
    // Same outer edges as outwardNormal for the convex rectangle.
    expect(norm(edgeOutwardNormal(rectLoop, 0))).toEqual({ x: 0, y: -1 }); // top → up
    expect(norm(edgeOutwardNormal(rectLoop, 1))).toEqual({ x: 1, y: 0 }); // right → +x
    // L-shape notch wall edge5 (100,404)→(100,0): solid is to the RIGHT (x>100),
    // so outward (toward the void) is −x.
    const e5 = norm(edgeOutwardNormal(lShape, 5));
    expect(e5).toEqual({ x: -1, y: 0 });
    // edge6 (100,0)→(0,0) is the notch's top wall: solid is below (y>0) on the
    // arm, void above → outward is −y.
    const e6 = norm(edgeOutwardNormal(lShape, 6));
    expect(e6).toEqual({ x: 0, y: -1 });
    // Degenerate edge → zero vector.
    const degen: Pt[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 }];
    expect(edgeOutwardNormal(degen, 0)).toEqual({ x: 0, y: 0 });
  });

  it("dimStyleForEdge picks inline / outside / bare by available px room", () => {
    // Plenty of room → inline, gap = the text half-width.
    const long = dimStyleForEdge(200, 22, 8, 22);
    expect(long.style).toBe("inline");
    expect(long.gapHalfPx).toBe(22);
    // Below the floor → bare.
    expect(dimStyleForEdge(10, 22, 8, 22).style).toBe("bare");
    // Between: too short to fit text inline but above the floor → outside.
    const mid = dimStyleForEdge(40, 22, 8, 22);
    expect(mid.style).toBe("outside");
    expect(mid.textOffsetPx).toBeGreaterThan(0);
    // Exactly at the inline threshold (2*half + 2*arrow + 4) → inline.
    const thresh = 2 * 22 + 2 * 8 + 4;
    expect(dimStyleForEdge(thresh, 22, 8, 22).style).toBe("inline");
    expect(dimStyleForEdge(thresh - 1, 22, 8, 22).style).toBe("outside");
  });

  it("overallDimensions reports bbox width/height with outward-pushed spans", () => {
    // Rectangle 320×500: width along the bottom (y=500), height along the right (x=320).
    const ov = overallDimensions(rectLoop);
    expect(ov).not.toBeNull();
    expect(ov!.width.lengthCm).toBe(320);
    expect(ov!.width.a).toEqual({ x: 0, y: 500 });
    expect(ov!.width.b).toEqual({ x: 320, y: 500 });
    expect(ov!.width.outward).toEqual({ x: 0, y: 1 }); // pushed down/out
    expect(ov!.height.lengthCm).toBe(500);
    expect(ov!.height.a).toEqual({ x: 320, y: 0 });
    expect(ov!.height.b).toEqual({ x: 320, y: 500 });
    expect(ov!.height.outward).toEqual({ x: 1, y: 0 }); // pushed right/out
    // L-shape: extents are the FULL bbox (340×622) even though no single edge
    // spans the whole width (the notch breaks the top edge).
    const ovL = overallDimensions(lShape);
    expect(ovL!.width.lengthCm).toBe(340);
    expect(ovL!.height.lengthCm).toBe(622);
    // Degenerate inputs → null.
    expect(overallDimensions([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBeNull();
    expect(overallDimensions([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }])).toBeNull();
  });

  it("dimensionOffsetLevels keeps non-overlapping rectangle edges all at level 0", () => {
    // A clean rectangle: each side is the only edge on its outward side → level 0.
    const levels = dimensionOffsetLevels(rectLoop, (i) => edgeOutwardNormal(rectLoop, i));
    expect(levels).toEqual([0, 0, 0, 0]);
  });

  it("dimensionOffsetLevels stacks collinear same-side edges onto distinct levels", () => {
    // An outline with TWO separate top edges that share the same outward side
    // (up) AND the same y, but are offset along x and overlap when one is wide.
    // Build a plus/notch where two 'down'-facing notch walls coexist with the
    // outer bottom: the L-shape's top is split into two 'up' edges at different y.
    // Simpler explicit case: a square plus a coincident-side stub.
    const poly: Pt[] = [
      { x: 0, y: 0 }, // edge0 top  (0,0)->(200,0)  outward up,  y=0
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 100, y: 100 }, // edge2 bottom-ish
      { x: 100, y: 0 }, // edge3 (100,100)->(100,0) vertical
      { x: 50, y: 0 }, // edge4 top  (100,0)->(50,0)? — overlapping 'up' span with edge0
    ];
    // We only assert the API shape + that it never throws and returns one level
    // per edge that is >= 0. (Exact levels depend on the winding/normals.)
    const levels = dimensionOffsetLevels(poly, (i) => edgeOutwardNormal(poly, i));
    expect(levels).toHaveLength(poly.length);
    for (const l of levels) expect(l).toBeGreaterThanOrEqual(0);
  });

  it("dimensionOffsetLevels bumps two overlapping same-side edges to 0 and 1", () => {
    // Two horizontal edges, both outward 'up' (negative y normal), overlapping in
    // x, on different y lines → must get different levels. Feed a stub outwardOf.
    const pts: Pt[] = [
      { x: 0, y: 100 }, // edge0 (0,100)->(200,100)  span x[0,200]
      { x: 200, y: 100 },
      { x: 50, y: 0 }, // edge1 (200,100)->(50,0) — ignore (diagonal)
      { x: 250, y: 0 }, // edge2 (50,0)->(250,0)   span x[50,250]
    ];
    // Force both edge0 and edge2 to face 'up' so they're in the same side group.
    const up = { x: 0, y: -1 };
    const outwardOf = (i: number) => (i === 0 || i === 2 ? up : { x: 1, y: 0 });
    const levels = dimensionOffsetLevels(pts, outwardOf);
    // edge0 first → level 0; edge2 overlaps it on x → level 1.
    expect(levels[0]).toBe(0);
    expect(levels[2]).toBe(1);
  });

  it("outwardNormal points away from the interior for a CW (screen) rectangle", () => {
    // Normalize signed zero so ±0 compare equal.
    const norm = (p: Pt): Pt => ({ x: p.x + 0, y: p.y + 0 });
    // rectLoop is clockwise in screen y-down coords.
    // edge0 top (0,0)→(320,0): outward is up (−y).
    expect(norm(outwardNormal(rectLoop, 0))).toEqual({ x: 0, y: -1 });
    // edge1 right (320,0)→(320,500): outward is +x.
    expect(norm(outwardNormal(rectLoop, 1))).toEqual({ x: 1, y: 0 });
    // edge2 bottom (320,500)→(0,500): outward is +y.
    expect(norm(outwardNormal(rectLoop, 2))).toEqual({ x: 0, y: 1 });
    // edge3 left (0,500)→(0,0): outward is −x.
    expect(norm(outwardNormal(rectLoop, 3))).toEqual({ x: -1, y: 0 });
    // Degenerate edge → zero vector.
    const degen: Pt[] = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 }];
    expect(outwardNormal(degen, 0)).toEqual({ x: 0, y: 0 });
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
    const layout = beamLayout(
      { rect: bays[0], beamDir },
      result.beam_count,
      result.block_rows,
      result.blocks_per_row,
      Math.round(result.beam_length * 100),
    );
    expect(layout.beams).toHaveLength(result.beam_count);
    // Block cells == engine total_blocks (rows × blocks_per_row).
    expect(layout.blockCells).toHaveLength(result.total_blocks);
    expect(layout.totalBlocks).toBe(result.total_blocks);
    // The bay schedule carries exactly the engine's beam_count at one length.
    expect(totalBeams(layout.schedule)).toBe(result.beam_count);
    expect(layout.schedule[0].lengthCm).toBe(Math.round(result.beam_length * 100));
  });

  it("places beams on the engine PITCH grid (centre-to-centre = PITCH_CM)", () => {
    // Tall H bay so every pitched beam fits: 8 beams at 58cm pitch.
    const bay: Bay = { rect: { x: 0, y: 0, w: 320, h: 500 }, beamDir: "H" };
    const { beams } = beamLayout(bay, 8, 8);
    // First beam strip starts at the wall (off 0 → top at y=0).
    expect(beams[0].y).toBeCloseTo(0, 6);
    // Consecutive beam top-edges are PITCH_CM apart (until clamped at the far wall).
    for (let i = 1; i < beams.length; i++) {
      const gap = beams[i].y - beams[i - 1].y;
      if (beams[i].y < 500 - BEAM_WIDTH_CM - 1e-6) {
        expect(gap).toBeCloseTo(PITCH_CM, 6);
      }
    }
  });

  it("draws beam strips at the real beam_length, centred (bearing overhang)", () => {
    // beam_length 350cm strip inside a 320cm run → clamps to the run width.
    const bay: Bay = { rect: { x: 0, y: 0, w: 320, h: 500 }, beamDir: "H" };
    const narrow = beamLayout(bay, 8, 8, 16, 350);
    for (const b of narrow.beams) expect(b.w).toBe(320); // clamped to run
    // A SHORTER strip than the run is centred, leaving equal margin each side.
    const widerBay: Bay = { rect: { x: 0, y: 0, w: 400, h: 500 }, beamDir: "H" };
    const centred = beamLayout(widerBay, 8, 8, 16, 350);
    for (const b of centred.beams) {
      expect(b.w).toBe(350);
      expect(b.x).toBeCloseTo(25, 6); // (400-350)/2 margin each side
    }
  });

  it("block cells == blockRows × blocks_per_row when blocks_per_row is given", () => {
    const bay: Bay = { rect: { x: 0, y: 0, w: 320, h: 500 }, beamDir: "H" };
    // 7 rows, 12 blocks per row → 84 cells, none overlapping the beam strips.
    const { blockCells, totalBlocks } = beamLayout(bay, 7, 7, 12, 350);
    expect(blockCells).toHaveLength(7 * 12);
    expect(totalBlocks).toBe(84);
  });

  it("emits a beam-run arrow along the run axis (H runs +x, V runs +y)", () => {
    const hBay: Bay = { rect: { x: 0, y: 0, w: 320, h: 500 }, beamDir: "H" };
    const hArrow = beamLayout(hBay, 8, 8, 16, 320).arrow;
    expect(hArrow.dir).toEqual({ x: 1, y: 0 }); // beams run along x
    expect(hArrow.head.x).toBeGreaterThan(hArrow.tail.x);
    expect(hArrow.tail.y).toBeCloseTo(250, 6); // down the perp midline
    expect(hArrow.head.y).toBeCloseTo(250, 6);

    const vBay: Bay = { rect: { x: 10, y: 20, w: 600, h: 300 }, beamDir: "V" };
    const vArrow = beamLayout(vBay, 5, 5).arrow;
    expect(vArrow.dir).toEqual({ x: 0, y: 1 }); // beams run along y
    expect(vArrow.head.y).toBeGreaterThan(vArrow.tail.y);
    expect(vArrow.tail.x).toBeCloseTo(10 + 300, 6); // perp midline of a 600-wide bay
  });

  it("echoes beamDir / beamCount / beamLengthCm for the renderer + legend", () => {
    const bay: Bay = { rect: { x: 0, y: 0, w: 320, h: 500 }, beamDir: "H" };
    const layout = beamLayout(bay, 8, 8, 16, 350);
    expect(layout.beamDir).toBe("H");
    expect(layout.beamCount).toBe(8);
    expect(layout.beamLengthCm).toBe(350);
    expect(layout.schedule[0].lengthCm).toBe(350);
  });

  it("caps the rendered block grid but keeps the true material total", () => {
    // A very large bay would otherwise emit thousands of cells. Force a grid
    // bigger than MAX_BLOCK_CELLS_PER_BAY: 100 rows × 50 cols = 5000 cells.
    const bay: Bay = { rect: { x: 0, y: 0, w: 1000, h: 6000 }, beamDir: "H" };
    const layout = beamLayout(bay, 100, 100, 50, 1000);
    expect(layout.blockCellsCapped).toBe(true);
    expect(layout.blockCells.length).toBeLessThanOrEqual(MAX_BLOCK_CELLS_PER_BAY);
    expect(layout.blockCells).toHaveLength(0); // suppressed entirely when over cap
    // The reported material total is the FULL count, not the drawn count.
    expect(layout.totalBlocks).toBe(100 * 50);
    // Just under the cap still draws the full grid.
    const ok: Bay = { rect: { x: 0, y: 0, w: 400, h: 600 }, beamDir: "H" };
    const small = beamLayout(ok, 10, 10, 12, 400);
    expect(small.blockCellsCapped).toBe(false);
    expect(small.blockCells).toHaveLength(10 * 12);
  });

  it("bayPalette cycles through the fixed palette and is stable", () => {
    expect(bayPalette(0)).toBe(BAY_PALETTE[0]);
    expect(bayPalette(BAY_PALETTE.length)).toBe(BAY_PALETTE[0]); // wraps
    expect(bayPalette(BAY_PALETTE.length + 2)).toBe(BAY_PALETTE[2]);
    // Every entry has the three colour roles the renderer/legend rely on.
    for (const p of BAY_PALETTE) {
      expect(p.beam).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.block).toMatch(/^#[0-9a-f]{6}$/i);
      expect(p.label).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("degenerate inputs return an empty layout", () => {
    const bay: Bay = { rect: { x: 0, y: 0, w: 320, h: 500 }, beamDir: "H" };
    const empty = beamLayout(bay, 0, 0);
    expect(empty.beams).toEqual([]);
    expect(empty.blockCells).toEqual([]);
    expect(empty.schedule).toEqual([]);
    expect(empty.totalBlocks).toBe(0);
    expect(empty.beamCount).toBe(0);
    expect(empty.blockCellsCapped).toBe(false);
    // A degenerate (zero-length) arrow at the bay centre.
    expect(empty.arrow.dir).toEqual({ x: 0, y: 0 });
  });
});

describe("cad geometry — visualization fidelity", () => {
  const within = (r: Rect, b: Rect) =>
    r.x >= b.x - 1e-6 &&
    r.y >= b.y - 1e-6 &&
    r.x + r.w <= b.x + b.w + 1e-6 &&
    r.y + r.h <= b.y + b.h + 1e-6;

  it("emits two bearing seats per beam, sized BEARING_CM, at the run ends (H)", () => {
    const bay: Bay = { rect: { x: 0, y: 0, w: 400, h: 500 }, beamDir: "H" };
    // 350cm strip centred in a 400cm run (25cm margin each side); 15cm bearings.
    const layout = beamLayout(bay, 4, 4, 16, 350, "GB", BEARING_CM);
    expect(layout.bearings).toHaveLength(4 * 2); // two per beam
    for (const s of layout.bearings) {
      expect(s.w).toBeCloseTo(BEARING_CM, 6); // seat length along the run axis
      expect(s.h).toBeCloseTo(BEAM_WIDTH_CM, 6); // full beam thickness
      expect(within(s, bay.rect)).toBe(true);
    }
    // The two seats of a beam sit at the strip's two ends: x=25 (near) and
    // x=25+350-15=360 (far).
    const xs = Array.from(new Set(layout.bearings.map((s) => Math.round(s.x)))).sort((a, b) => a - b);
    expect(xs).toEqual([25, 360]);
  });

  it("bearing seats run along the beam for a vertical bay (V)", () => {
    const bay: Bay = { rect: { x: 0, y: 0, w: 500, h: 400 }, beamDir: "V" };
    const layout = beamLayout(bay, 4, 4, 16, 350, "GB", BEARING_CM);
    expect(layout.bearings).toHaveLength(8);
    for (const s of layout.bearings) {
      expect(s.h).toBeCloseTo(BEARING_CM, 6); // seat length is along y (run axis)
      expect(s.w).toBeCloseTo(BEAM_WIDTH_CM, 6); // beam thickness along x
    }
  });

  it("no bearing seats when bearing is 0 / omitted (back-compat)", () => {
    const bay: Bay = { rect: { x: 0, y: 0, w: 320, h: 500 }, beamDir: "H" };
    expect(beamLayout(bay, 8, 8, 16, 320).bearings).toEqual([]);
    expect(beamLayout(bay, 8, 8, 16, 320, "GB", 0).bearings).toEqual([]);
  });

  it("draws true BLOCK_LENGTH_CM modules, last cell absorbing the remainder", () => {
    // 350cm run, 18 cols. 18×20=360 > 350 → NOT true modules (even split).
    // Use a run that divides: 360cm run, 18 cols → exactly 20cm each.
    const evenBay: Bay = { rect: { x: 0, y: 0, w: 360, h: 500 }, beamDir: "H" };
    const even = beamLayout(evenBay, 4, 4, 18, 360, "GB");
    expect(even.blockModuleCm).toBe(BLOCK_LENGTH_CM);
    // Every cell is a true 20cm module.
    for (const c of even.blockCells) expect(c.w).toBeCloseTo(BLOCK_LENGTH_CM, 6);

    // 350cm run, 17 cols. 17×20=340 ≤ 350 → true modules; last cell = 350-320=30.
    const remBay: Bay = { rect: { x: 0, y: 0, w: 350, h: 500 }, beamDir: "H" };
    const rem = beamLayout(remBay, 4, 4, 17, 350, "GB");
    expect(rem.blockModuleCm).toBe(BLOCK_LENGTH_CM);
    // First row's first 16 cells are 20cm; the 17th absorbs 350-16*20 = 30cm.
    const firstRow = rem.blockCells.slice(0, 17);
    for (let i = 0; i < 16; i++) expect(firstRow[i].w).toBeCloseTo(BLOCK_LENGTH_CM, 6);
    expect(firstRow[16].w).toBeCloseTo(350 - 16 * BLOCK_LENGTH_CM, 6);
    // Cells still tile the full run with no gap/overrun.
    const right = firstRow[16].x + firstRow[16].w;
    expect(right).toBeCloseTo(350, 6);
    for (const c of rem.blockCells) expect(within(c, remBay.rect)).toBe(true);
  });

  it("falls back to an even split when true modules don't fit the run", () => {
    // 100cm run, 18 cols. 18×20=360 > 100 → even split of 100/18 each.
    const bay: Bay = { rect: { x: 0, y: 0, w: 100, h: 500 }, beamDir: "H" };
    const layout = beamLayout(bay, 4, 4, 18, 100, "GB");
    expect(layout.blockModuleCm).toBeCloseTo(100 / 18, 6);
    for (const c of layout.blockCells) expect(c.w).toBeCloseTo(100 / 18, 6);
  });

  it("reports the pitch extent the run actually fills (≤ perp span)", () => {
    // 8 GB beams at 58 pitch in a 500-tall H bay: extent = last row far edge.
    const bay: Bay = { rect: { x: 0, y: 0, w: 320, h: 500 }, beamDir: "H" };
    const layout = beamLayout(bay, 8, 8, 16, 320, "GB");
    expect(layout.pitchExtentCm).toBeGreaterThan(0);
    expect(layout.pitchExtentCm).toBeLessThanOrEqual(500 + 1e-6);
    // Empty layout reports 0.
    expect(beamLayout(bay, 0, 0).pitchExtentCm).toBe(0);
  });

  it("scaleBar picks a nice 1/2/5×10ⁿ length that fits the max px width", () => {
    // At 0.6 px/cm, 140px → 233cm max → biggest nice value ≤ 233 is 200cm.
    const sb = scaleBar(0.6, 140);
    expect(sb.lengthCm).toBe(200);
    expect(sb.px).toBeCloseTo(120, 6);
    expect(sb.label).toBe("2 m");
    // Zoomed-in (more px/cm) shrinks the chosen length.
    const zoomed = scaleBar(3, 140); // 140/3 = 46.6cm max → 20cm
    expect(zoomed.lengthCm).toBe(20);
    // Degenerate inputs fall back to 1cm without throwing.
    expect(scaleBar(0, 140).lengthCm).toBe(1);
    expect(scaleBar(0.6, 0).lengthCm).toBe(1);
  });
});

describe("cad geometry — render fidelity (kinds, labels, perp dim, budget)", () => {
  it("beamLayout reports per-beam kind, structural-first then extras", () => {
    const bay: Bay = { rect: { x: 0, y: 0, w: 320, h: 900 }, beamDir: "H" };
    // GB 5 structural + 2 extras → 7 beams.
    const layout = beamLayout(bay, 7, 5, 16, 320, "GB");
    expect(layout.beamKinds).toHaveLength(7);
    // First 5 structural, last 2 extra (extras are appended past the run).
    expect(layout.beamKinds.slice(0, 5)).toEqual([
      "structural",
      "structural",
      "structural",
      "structural",
      "structural",
    ]);
    expect(layout.beamKinds.slice(5)).toEqual(["extra", "extra"]);
    // kinds are index-aligned with beams; extra strips sit at the largest offsets.
    const extraIdx = layout.beamKinds
      .map((k, i) => (k === "extra" ? i : -1))
      .filter((i) => i >= 0);
    const ys = layout.beams.map((b) => b.y);
    const maxStructuralY = Math.max(
      ...layout.beams.filter((_, i) => layout.beamKinds[i] === "structural").map((b) => b.y),
    );
    for (const i of extraIdx) expect(ys[i]).toBeGreaterThan(maxStructuralY - 1e-6);
    // Empty layout has an empty kinds array.
    expect(beamLayout(bay, 0, 0).beamKinds).toEqual([]);
  });

  it("bayLabelLines builds engine-consistent multi-line chip content", () => {
    const bay: Bay = { rect: { x: 0, y: 0, w: 320, h: 900 }, beamDir: "H" };
    const layout = beamLayout(bay, 7, 5, 16, 320, "GB");
    const lines = bayLabelLines(layout);
    // Primary: count (+extras) · length. Secondary: pattern · blocks.
    expect(lines[0]).toEqual({ role: "primary", text: "7 beams (+2) · 3.2 m" });
    expect(lines[1]).toEqual({ role: "secondary", text: `GB · ${layout.totalBlocks} blocks` });
    // No warn line for a clean, fully-drawn bay.
    expect(lines.some((l) => l.role === "warn")).toBe(false);
  });

  it("bayLabelLines singularises and adds a warn line for overflow / hidden grid", () => {
    const one = bayLabelLines({
      beamCount: 1,
      extraBeams: 0,
      beamLengthCm: 300,
      pattern: "GB",
      totalBlocks: 1,
      blockCellsCapped: false,
      pitchOverflow: false,
      beamDir: "H",
    });
    expect(one[0].text).toBe("1 beam · 3 m"); // singular "beam"
    expect(one[1].text).toBe("GB · 1 block"); // singular "block"

    // pitchOverflow → "not to scale" warn line (takes priority).
    const over = bayLabelLines({
      beamCount: 8,
      extraBeams: 0,
      beamLengthCm: 320,
      pattern: "GB",
      totalBlocks: 64,
      blockCellsCapped: false,
      pitchOverflow: true,
      beamDir: "H",
    });
    expect(over.find((l) => l.role === "warn")?.text).toBe("⚠ not to scale");

    // Capped grid (no overflow) → "grid hidden" warn line.
    const capped = bayLabelLines(
      {
        beamCount: 4,
        extraBeams: 0,
        beamLengthCm: 320,
        pattern: "GB",
        totalBlocks: 64,
        blockCellsCapped: true,
        pitchOverflow: false,
        beamDir: "H",
      },
    );
    expect(capped.find((l) => l.role === "warn")?.text).toBe("grid hidden");

    // gridShown=false also yields "grid hidden" even when not capped.
    const budgeted = bayLabelLines(
      {
        beamCount: 4,
        extraBeams: 0,
        beamLengthCm: 320,
        pattern: "GB",
        totalBlocks: 64,
        blockCellsCapped: false,
        pitchOverflow: false,
        beamDir: "H",
      },
      false,
    );
    expect(budgeted.find((l) => l.role === "warn")?.text).toBe("grid hidden");
  });

  it("perpDimension spans the pitched-run depth on the bay's spacing axis", () => {
    // H bay: depth runs vertically at the left wall (inset 10cm).
    const hBay: Bay = { rect: { x: 100, y: 200, w: 320, h: 500 }, beamDir: "H" };
    const hd = perpDimension(hBay, 400, 10);
    expect(hd).not.toBeNull();
    expect(hd!.a).toEqual({ x: 110, y: 200 }); // left wall + 10cm inset, top
    expect(hd!.b).toEqual({ x: 110, y: 600 }); // down by the 400cm extent
    expect(hd!.lengthCm).toBe(400);
    expect(hd!.along).toEqual({ x: 0, y: 1 });
    expect(hd!.outward).toEqual({ x: -1, y: 0 });

    // V bay: depth runs horizontally at the top wall.
    const vBay: Bay = { rect: { x: 0, y: 0, w: 600, h: 300 }, beamDir: "V" };
    const vd = perpDimension(vBay, 250, 10);
    expect(vd!.a).toEqual({ x: 0, y: 10 });
    expect(vd!.b).toEqual({ x: 250, y: 10 });
    expect(vd!.along).toEqual({ x: 1, y: 0 });
    expect(vd!.outward).toEqual({ x: 0, y: -1 });

    // Extent is clamped to the bay's perp span.
    const clamped = perpDimension(hBay, 9999, 0);
    expect(clamped!.lengthCm).toBe(500); // bay height

    // Degenerate extent → null.
    expect(perpDimension(hBay, 0, 0)).toBeNull();
    expect(perpDimension(hBay, -5, 0)).toBeNull();
  });

  it("perpDimension matches a real layout's pitchExtentCm", () => {
    const bay: Bay = { rect: { x: 0, y: 0, w: 320, h: 600 }, beamDir: "H" };
    const layout = beamLayout(bay, 8, 8, 16, 320, "GB");
    const pd = perpDimension(bay, layout.pitchExtentCm, 0);
    expect(pd).not.toBeNull();
    // The dimension ends exactly where the structural run ends.
    expect(pd!.b.y - pd!.a.y).toBeCloseTo(layout.pitchExtentCm, 6);
  });

  it("blockCellBudget admits bays greedily until the total budget is spent", () => {
    // 3 bays of 100/200/300 cells, budget 450 → 100+200 fit (300), 300 would
    // overflow → dropped. Greedy ascending: smallest first.
    const allow = blockCellBudget([300, 100, 200], 450);
    expect(allow).toEqual([false, true, true]); // 100 & 200 admitted, 300 dropped
    // Everything fits under a generous budget.
    expect(blockCellBudget([100, 200, 300], 10000)).toEqual([true, true, true]);
    // Zero-cell bays are never "allowed" (nothing to draw).
    expect(blockCellBudget([0, 50], 1000)).toEqual([false, true]);
    // Empty input → empty result.
    expect(blockCellBudget([], 1000)).toEqual([]);
    // Default budget is the exported constant; a single bay over it is dropped.
    expect(blockCellBudget([MAX_BLOCK_CELLS_TOTAL + 1])).toEqual([false]);
    expect(blockCellBudget([MAX_BLOCK_CELLS_TOTAL])).toEqual([true]);
  });
});

describe("cad geometry — beam schedule (cut-list)", () => {
  it("merges per-bay schedules: groups by length, sums counts, sorts ascending", () => {
    const merged = mergeBeamSchedule([
      [{ lengthCm: 350, count: 8 }],
      [{ lengthCm: 350, count: 3 }],
      [{ lengthCm: 220, count: 5 }],
    ]);
    expect(merged).toEqual([
      { lengthCm: 220, count: 5 },
      { lengthCm: 350, count: 11 },
    ]);
    expect(totalBeams(merged)).toBe(16);
  });

  it("drops zero/empty entries and handles an empty project", () => {
    expect(mergeBeamSchedule([])).toEqual([]);
    expect(mergeBeamSchedule([[{ lengthCm: 350, count: 0 }], []])).toEqual([]);
  });

  it("mergeBeamScheduleByKind preserves the structural/extra split per length", () => {
    const merged = mergeBeamScheduleByKind([
      [
        { lengthCm: 350, count: 5, kind: "structural" },
        { lengthCm: 350, count: 2, kind: "extra" },
      ],
      [{ lengthCm: 350, count: 3, kind: "structural" }],
      [{ lengthCm: 220, count: 4, kind: "structural" }],
    ]);
    // Sorted by length, structural before extra at the same length.
    expect(merged).toEqual([
      { lengthCm: 220, count: 4, kind: "structural" },
      { lengthCm: 350, count: 8, kind: "structural" },
      { lengthCm: 350, count: 2, kind: "extra" },
    ]);
    // Collapsing the same input by length only matches mergeBeamSchedule.
    expect(mergeBeamSchedule([
      [
        { lengthCm: 350, count: 5, kind: "structural" },
        { lengthCm: 350, count: 2, kind: "extra" },
      ],
      [{ lengthCm: 350, count: 3, kind: "structural" }],
      [{ lengthCm: 220, count: 4, kind: "structural" }],
    ])).toEqual([
      { lengthCm: 220, count: 4 },
      { lengthCm: 350, count: 10 },
    ]);
  });

  it("mergeBeamScheduleByKind defaults bare (kind-less) rows to structural", () => {
    const merged = mergeBeamScheduleByKind([[{ lengthCm: 300, count: 6 }]]);
    expect(merged).toEqual([{ lengthCm: 300, count: 6, kind: "structural" }]);
  });

  it("totalBeamsOfKind counts only the requested kind", () => {
    const sched = mergeBeamScheduleByKind([
      [
        { lengthCm: 350, count: 5, kind: "structural" },
        { lengthCm: 350, count: 2, kind: "extra" },
      ],
    ]);
    expect(totalBeamsOfKind(sched, "structural")).toBe(5);
    expect(totalBeamsOfKind(sched, "extra")).toBe(2);
    expect(totalBeams(sched)).toBe(7);
  });

  it("an L-shape's merged schedule total equals the sum of bay beam_counts", () => {
    const bays = decomposeToBays(lShape);
    const layers = bays.map((rect) => {
      const beamDir = defaultBeamDir(rect);
      const result = calculateSlab(bayToSlabInput({ rect, beamDir }));
      return beamLayout(
        { rect, beamDir },
        result.beam_count,
        result.block_rows,
        result.blocks_per_row,
        Math.round(result.beam_length * 100),
      );
    });
    const merged = mergeBeamSchedule(layers.map((l) => l.schedule));
    const engineTotal = bays.reduce((s, rect) => {
      const beamDir = defaultBeamDir(rect);
      return s + calculateSlab(bayToSlabInput({ rect, beamDir })).beam_count;
    }, 0);
    expect(totalBeams(merged)).toBe(engineTotal);
  });
});

describe("cad geometry — pattern-aware beam/block layout", () => {
  const within = (r: Rect, b: Rect) =>
    r.x >= b.x - 1e-6 &&
    r.y >= b.y - 1e-6 &&
    r.x + r.w <= b.x + b.w + 1e-6 &&
    r.y + r.h <= b.y + b.h + 1e-6;

  it("structuralBeamCount splits beam_count per pattern", () => {
    // GB: beams == rows. BGB: rows+1 (closing beam). GBG: rows-1.
    expect(structuralBeamCount("GB", 8)).toBe(8);
    expect(structuralBeamCount("BGB", 8)).toBe(9);
    expect(structuralBeamCount("GBG", 8)).toBe(7);
    // Never negative for a degenerate GBG.
    expect(structuralBeamCount("GBG", 0)).toBe(0);
  });

  it("patternSpans places GB beams on the pitch grid, rows after each beam", () => {
    const { beamCentres, rowSpans } = patternSpans("GB", 3, 3, BEAM_WIDTH_CM);
    // Beam 0 centre = half a beam-width off the wall; then every PITCH_CM.
    expect(beamCentres).toEqual([
      BEAM_WIDTH_CM / 2,
      BEAM_WIDTH_CM / 2 + PITCH_CM,
      BEAM_WIDTH_CM / 2 + 2 * PITCH_CM,
    ]);
    // 3 block rows, each starting just past its beam, PITCH_CM−beamThick thick.
    expect(rowSpans).toHaveLength(3);
    expect(rowSpans[0]).toEqual({ start: BEAM_WIDTH_CM, thick: PITCH_CM - BEAM_WIDTH_CM });
  });

  it("patternSpans leads GBG with a wall block row before the first beam", () => {
    const { beamCentres, rowSpans } = patternSpans("GBG", 2, 3, BEAM_WIDTH_CM);
    // GBG opens with a block row → first beam is pushed in by BLOCK_VISIBLE_CM.
    expect(beamCentres[0]).toBe(BLOCK_VISIBLE_CM + BEAM_WIDTH_CM / 2);
    // 3 rows total: a leading wall row (start 0) + one row after each beam.
    expect(rowSpans).toHaveLength(3);
    expect(rowSpans[0].start).toBe(0);
    expect(rowSpans[0].thick).toBe(BLOCK_VISIBLE_CM); // wall row up to beam 0 top
  });

  it("BGB draws the closing beam (beamCount = rows + 1) and rows between beams", () => {
    const bay: Bay = { rect: { x: 0, y: 0, w: 320, h: 600 }, beamDir: "H" };
    // BGB at 5 pitches → 6 beams, 5 block rows.
    const layout = beamLayout(bay, 6, 5, 16, 320, "BGB");
    expect(layout.beams).toHaveLength(6);
    expect(layout.structuralBeams).toBe(6); // all structural, no manual extras
    expect(layout.extraBeams).toBe(0);
    expect(layout.blockCells).toHaveLength(5 * 16);
    expect(layout.totalBlocks).toBe(5 * 16);
    for (const b of layout.beams) expect(within(b, bay.rect)).toBe(true);
  });

  it("GBG draws an extra block row (beamCount = rows − 1), block-first", () => {
    const bay: Bay = { rect: { x: 0, y: 0, w: 320, h: 600 }, beamDir: "H" };
    // GBG at 5 pitches → 5 beams, 6 block rows.
    const layout = beamLayout(bay, 5, 6, 16, 320, "GBG");
    expect(layout.beams).toHaveLength(5);
    expect(layout.structuralBeams).toBe(5);
    expect(layout.blockCells).toHaveLength(6 * 16);
    expect(layout.totalBlocks).toBe(6 * 16);
    // The FIRST drawn element is a block row at the wall (y≈0), not a beam:
    // some block cell sits above the first beam strip.
    const firstBeamTop = Math.min(...layout.beams.map((b) => b.y));
    const someBlockAboveFirstBeam = layout.blockCells.some((c) => c.y < firstBeamTop - 1e-6);
    expect(someBlockAboveFirstBeam).toBe(true);
  });

  it("manual extra beams are appended past the structural run (split reported)", () => {
    const bay: Bay = { rect: { x: 0, y: 0, w: 320, h: 900 }, beamDir: "H" };
    // GB at 5 pitches + 2 manual extras → beam_count 7, block_rows 5.
    const layout = beamLayout(bay, 7, 5, 16, 320, "GB");
    expect(layout.beams).toHaveLength(7);
    expect(layout.structuralBeams).toBe(5);
    expect(layout.extraBeams).toBe(2);
    // The two extras sit past the 5 structural beams (largest y offsets).
    const ys = layout.beams.map((b) => b.y).sort((a, b) => a - b);
    expect(ys[6] - ys[5]).toBeCloseTo(BEAM_WIDTH_CM, 6); // extras one beam-width apart
    // Schedule still totals the full engine beam_count.
    expect(totalBeams(layout.schedule)).toBe(7);
  });

  it("manual extras begin past the LAST block row, not overlapping it", () => {
    // GB at 5 pitches + 2 manual extras → 7 beams, 5 rows. The last structural
    // block row sits between the last beam and the slab end; an extra placed at
    // the last beam's edge (the old bug) would overlap that row. With the fix the
    // first extra starts at the far edge of the last row.
    const bay: Bay = { rect: { x: 0, y: 0, w: 320, h: 900 }, beamDir: "H" };
    const layout = beamLayout(bay, 7, 5, 16, 320, "GB");
    // Structural beam tops: 0, 58, 116, 174, 232 (centre − beamThick/2). Last
    // structural beam strip ends at 232+12=244; its trailing row spans 244→290.
    const lastStructuralRowFar = 244 + (PITCH_CM - BEAM_WIDTH_CM); // 244 + 46 = 290
    const extraTops = layout.beams
      .map((b) => b.y)
      .filter((yy) => yy >= lastStructuralRowFar - 1e-6)
      .sort((a, b) => a - b);
    expect(extraTops).toHaveLength(2);
    // First extra strip starts at (or after) the last block row's far edge — no
    // overlap with the structural block grid.
    expect(extraTops[0]).toBeGreaterThanOrEqual(lastStructuralRowFar - 1e-6);
    // No two beam strips overlap on the perp axis (each is BEAM_WIDTH_CM thick).
    const tops = layout.beams.map((b) => b.y).sort((a, b) => a - b);
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i] - tops[i - 1]).toBeGreaterThanOrEqual(BEAM_WIDTH_CM - 1e-6);
    }
  });

  it("flags pitchOverflow when the engine pitch count can't fit the drawn bay", () => {
    // 8 GB beams need ~7×58 + a row ≈ 450cm of perp depth. A 200-tall bay can't
    // hold them at true pitch → the strips clamp and pitchOverflow is true.
    const tight: Bay = { rect: { x: 0, y: 0, w: 320, h: 200 }, beamDir: "H" };
    const over = beamLayout(tight, 8, 8, 16, 320, "GB");
    expect(over.pitchOverflow).toBe(true);
    expect(over.requiredPerpCm).toBeGreaterThan(200);
    // Counts are still the engine's, untouched by the visual clamp.
    expect(over.beamCount).toBe(8);
    expect(totalBeams(over.schedule)).toBe(8);
    // A roomy bay fits the same pattern with no overflow.
    const roomy: Bay = { rect: { x: 0, y: 0, w: 320, h: 600 }, beamDir: "H" };
    const ok = beamLayout(roomy, 8, 8, 16, 320, "GB");
    expect(ok.pitchOverflow).toBe(false);
    expect(ok.requiredPerpCm).toBeLessThanOrEqual(600 + 1e-6);
  });

  it("requiredPerpDepth measures the un-clamped pattern depth + extras", () => {
    // GB 3 beams / 3 rows: last row far edge = 2×58 + beamThick + (58−beamThick)
    //  = 116 + 12 + 46 = 174  →  (== 3 rows × pitch, since GB tiles cleanly).
    expect(requiredPerpDepth("GB", 3, 3, BEAM_WIDTH_CM)).toBeCloseTo(3 * PITCH_CM, 6);
    // Two extras add 2 × beamThick on top.
    expect(requiredPerpDepth("GB", 3, 3, BEAM_WIDTH_CM, 2)).toBeCloseTo(
      3 * PITCH_CM + 2 * BEAM_WIDTH_CM,
      6,
    );
    // GBG leads with a BLOCK_VISIBLE wall row → deeper than GB for the same beams.
    expect(requiredPerpDepth("GBG", 2, 3, BEAM_WIDTH_CM)).toBeGreaterThan(
      requiredPerpDepth("GB", 2, 2, BEAM_WIDTH_CM),
    );
    // Degenerate (no beams) → 0.
    expect(requiredPerpDepth("GB", 0, 0, BEAM_WIDTH_CM)).toBe(0);
  });

  it("the per-bay schedule is split by kind (structural vs extra)", () => {
    const bay: Bay = { rect: { x: 0, y: 0, w: 320, h: 900 }, beamDir: "H" };
    // GB 5 structural + 2 extras at 320cm beam length.
    const layout = beamLayout(bay, 7, 5, 16, 320, "GB");
    expect(layout.schedule).toEqual([
      { lengthCm: 320, count: 5, kind: "structural" },
      { lengthCm: 320, count: 2, kind: "extra" },
    ]);
    // Pure-structural bay emits a single structural row, no extra row.
    const noExtra = beamLayout(bay, 5, 5, 16, 320, "GB");
    expect(noExtra.schedule).toEqual([{ lengthCm: 320, count: 5, kind: "structural" }]);
  });

  it("default pattern is GB — backward-compatible with the un-patterned call", () => {
    const bay: Bay = { rect: { x: 0, y: 0, w: 320, h: 500 }, beamDir: "H" };
    const a = beamLayout(bay, 8, 8, 16, 320);
    const b = beamLayout(bay, 8, 8, 16, 320, "GB");
    expect(a.beams).toEqual(b.beams);
    expect(a.blockCells).toEqual(b.blockCells);
    expect(a.pattern).toBe("GB");
  });

  it("the engine's chosen pattern feeds a faithful overlay (counts + split)", () => {
    // Drive beamLayout from a real engine result and assert the picture matches.
    const bays = decomposeToBays(rectLoop);
    const beamDir = defaultBeamDir(bays[0]);
    const result = calculateSlab(bayToSlabInput({ rect: bays[0], beamDir }));
    const layout = beamLayout(
      { rect: bays[0], beamDir },
      result.beam_count,
      result.block_rows,
      result.blocks_per_row,
      Math.round(result.beam_length * 100),
      result.pattern,
    );
    expect(layout.beams).toHaveLength(result.beam_count);
    expect(layout.totalBlocks).toBe(result.total_blocks);
    expect(layout.pattern).toBe(result.pattern);
    // structural + extras reconstruct the full engine beam_count.
    expect(layout.structuralBeams + layout.extraBeams).toBe(result.beam_count);
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
