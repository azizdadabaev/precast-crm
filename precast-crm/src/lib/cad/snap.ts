// CAD-grade snap engine for the in-browser room drawing tool. PURE + unit-tested:
// given the cursor, the current outline, a polar anchor and a pick tolerance, it
// resolves the single best snapped point plus any on-screen guide segments. The
// editor renders a marker keyed by `type` and dashed lines for each `guide`.
//
// Two tiers, in order:
//  1) HARD point snaps (endpoint / intersection / midpoint / perpendicular / edge)
//     — a candidate must land within `tolCm` of the cursor; the highest-priority
//     one wins and we return immediately with no guides.
//  2) SOFT constraints (polar tracking, then axis alignment) — these don't need a
//     nearby object; they bend the free cursor onto a ray / shared axis and emit
//     dashed guides so the lock-on reads. Polar wins over alignment (we skip
//     alignment when polar moved the point) so the ray angle is never fought.
//  3) Grid fallback, else the raw cursor.

import type { Pt } from "@/lib/cad/geometry";
import { pointSegment, snapToGrid } from "@/lib/cad/geometry";

export type SnapType =
  | "endpoint"
  | "midpoint"
  | "edge"
  | "perpendicular"
  | "intersection"
  | "alignment"
  | "polar"
  | "grid";

/** A cm-space dashed guide segment the renderer draws to explain a soft snap. */
export interface SnapGuide {
  a: Pt;
  b: Pt;
  kind: "alignment" | "polar";
}

export interface SnapResult {
  point: Pt;
  type: SnapType | null;
  guides: SnapGuide[];
}

export interface SnapSettings {
  endpoint: boolean;
  midpoint: boolean;
  edge: boolean;
  perpendicular: boolean;
  intersection: boolean;
  alignment: boolean;
  polar: boolean;
  grid: boolean;
  gridStepCm: number;
  /** Polar tracking increment in degrees (15 | 45 | 90 typical). */
  polarStepDeg: number;
}

export interface SnapInput {
  cursor: Pt;
  points: Pt[];
  closed: boolean;
  /** Polar anchor (the last placed vertex while drawing); null disables polar. */
  origin: Pt | null;
  /** Vertex being dragged → ignore it for endpoint/alignment snaps. */
  excludeIndex: number | null;
  /** Pick radius in cm (caller passes pxToCm(~10px)). */
  tolCm: number;
  settings: SnapSettings;
  /** OTHER rooms' outlines to also snap to (cross-room snapping). Their
   *  vertices, midpoints and edges become hard snap candidates and alignment
   *  sources so adjacent rooms lock together at shared walls. Omitted/empty →
   *  single-room behaviour (byte-identical to before). */
  extraLoops?: Array<{ points: Pt[]; closed: boolean }>;
}

export const DEFAULT_SNAP_SETTINGS: SnapSettings = {
  endpoint: true,
  midpoint: true,
  edge: true,
  perpendicular: true,
  intersection: false,
  alignment: true,
  polar: true,
  grid: true,
  gridStepCm: 10,
  polarStepDeg: 90,
};

// How far (cm) a soft guide extends past its anchor, so the dashed line reads on
// screen as a long reference. ~5 m each way is plenty for a room drawing.
const GUIDE_REACH_CM = 500;

// Priority order for hard point snaps (lower index = higher priority).
const HARD_PRIORITY: SnapType[] = [
  "endpoint",
  "intersection",
  "midpoint",
  "perpendicular",
  "edge",
];

interface Candidate {
  point: Pt;
  type: SnapType;
  dist: number;
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Iterate every edge of the (closed or open) outline as [a, b] index pairs. */
function edges(points: Pt[], closed: boolean): Array<[number, number]> {
  const n = points.length;
  const out: Array<[number, number]> = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) out.push([i, (i + 1) % n]);
  return out;
}

/** Infinite-line intersection of segments a→b and c→d, or null if parallel. */
function lineIntersection(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r1x = b.x - a.x;
  const r1y = b.y - a.y;
  const r2x = d.x - c.x;
  const r2y = d.y - c.y;
  const denom = r1x * r2y - r1y * r2x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((c.x - a.x) * r2y - (c.y - a.y) * r2x) / denom;
  return { x: a.x + t * r1x, y: a.y + t * r1y };
}

/** Is `p` on segment a→b (within a small tolerance)? */
function onSegment(p: Pt, a: Pt, b: Pt, tol = 1e-6): boolean {
  const { dist: d } = pointSegment(p, a, b);
  return d <= tol;
}

/** Two edges are adjacent if they share a vertex index. */
function adjacent(e1: [number, number], e2: [number, number]): boolean {
  return (
    e1[0] === e2[0] || e1[0] === e2[1] || e1[1] === e2[0] || e1[1] === e2[1]
  );
}

/**
 * Resolve the best snap for `input`. See the file header for the priority model.
 * Pure — no Date/random; deterministic for a given input.
 */
export function computeSnap(input: SnapInput): SnapResult {
  const { cursor, points, closed, origin, excludeIndex, tolCm, settings } =
    input;

  // Snap sources: the active room (its dragged vertex excluded) plus any other
  // rooms of the floor plan (no excluded vertex). Single source → behaviour is
  // identical to the original single-room engine.
  const sources: Array<{ points: Pt[]; closed: boolean; exclude: number | null }> = [
    { points, closed, exclude: excludeIndex },
    ...(input.extraLoops ?? []).map((l) => ({
      points: l.points,
      closed: l.closed,
      exclude: null,
    })),
  ];

  // ── Tier 1: HARD point snaps ──────────────────────────────────────────────
  const candidates: Candidate[] = [];

  for (const src of sources) {
    const sp = src.points;
    const exclude = src.exclude;

    // endpoint: any vertex ≠ excluded.
    if (settings.endpoint) {
      for (let i = 0; i < sp.length; i++) {
        if (i === exclude) continue;
        const d = dist(cursor, sp[i]);
        if (d <= tolCm) {
          candidates.push({ point: { ...sp[i] }, type: "endpoint", dist: d });
        }
      }
    }

    const edgeList = edges(sp, src.closed);

    // intersection: crossing of two NON-ADJACENT edges of this room, near cursor.
    if (settings.intersection) {
      for (let i = 0; i < edgeList.length; i++) {
        for (let j = i + 1; j < edgeList.length; j++) {
          const e1 = edgeList[i];
          const e2 = edgeList[j];
          if (adjacent(e1, e2)) continue;
          const a = sp[e1[0]];
          const b = sp[e1[1]];
          const c = sp[e2[0]];
          const dd = sp[e2[1]];
          const x = lineIntersection(a, b, c, dd);
          if (!x) continue;
          // Must lie on BOTH segments (a real crossing, not an extension).
          if (!onSegment(x, a, b, 1e-6) || !onSegment(x, c, dd, 1e-6)) continue;
          const d = dist(cursor, x);
          if (d <= tolCm) {
            candidates.push({ point: x, type: "intersection", dist: d });
          }
        }
      }
    }

    // midpoint: midpoint of each edge.
    if (settings.midpoint) {
      for (const [ai, bi] of edgeList) {
        const m = {
          x: (sp[ai].x + sp[bi].x) / 2,
          y: (sp[ai].y + sp[bi].y) / 2,
        };
        const d = dist(cursor, m);
        if (d <= tolCm) candidates.push({ point: m, type: "midpoint", dist: d });
      }
    }

    // perpendicular: foot of the perpendicular from `origin` onto an edge LINE,
    // if the foot lands on the segment.
    if (settings.perpendicular && origin) {
      for (const [ai, bi] of edgeList) {
        const a = sp[ai];
        const b = sp[bi];
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const len2 = abx * abx + aby * aby;
        if (len2 < 1e-12) continue;
        const t = ((origin.x - a.x) * abx + (origin.y - a.y) * aby) / len2;
        if (t < 0 || t > 1) continue; // foot off the segment
        const foot = { x: a.x + t * abx, y: a.y + t * aby };
        const d = dist(cursor, foot);
        if (d <= tolCm) {
          candidates.push({ point: foot, type: "perpendicular", dist: d });
        }
      }
    }

    // edge: nearest point on any edge segment.
    if (settings.edge) {
      for (const [ai, bi] of edgeList) {
        const { dist: d, closest } = pointSegment(cursor, sp[ai], sp[bi]);
        if (d <= tolCm) candidates.push({ point: closest, type: "edge", dist: d });
      }
    }
  }

  if (candidates.length > 0) {
    // Pick by priority, breaking ties by nearest.
    candidates.sort((p, q) => {
      const pp = HARD_PRIORITY.indexOf(p.type);
      const qp = HARD_PRIORITY.indexOf(q.type);
      if (pp !== qp) return pp - qp;
      return p.dist - q.dist;
    });
    const best = candidates[0];
    return { point: best.point, type: best.type, guides: [] };
  }

  // ── Tier 2: SOFT constraints ──────────────────────────────────────────────
  let point: Pt = { ...cursor };
  let type: SnapType | null = null;
  const guides: SnapGuide[] = [];

  // polar tracking off the origin ray.
  let polarApplied = false;
  if (settings.polar && origin) {
    const dx = cursor.x - origin.x;
    const dy = cursor.y - origin.y;
    if (dx !== 0 || dy !== 0) {
      const stepRad = (settings.polarStepDeg * Math.PI) / 180;
      if (stepRad > 0) {
        const ang = Math.atan2(dy, dx);
        const snapped = Math.round(ang / stepRad) * stepRad;
        const ux = Math.cos(snapped);
        const uy = Math.sin(snapped);
        // Project the cursor onto the ray; clamp the distance ≥ 0.
        const proj = Math.max(0, dx * ux + dy * uy);
        point = { x: origin.x + ux * proj, y: origin.y + uy * proj };
        type = "polar";
        polarApplied = true;
        guides.push({
          kind: "polar",
          a: { x: origin.x - ux * GUIDE_REACH_CM, y: origin.y - uy * GUIDE_REACH_CM },
          b: { x: origin.x + ux * GUIDE_REACH_CM, y: origin.y + uy * GUIDE_REACH_CM },
        });
      }
    }
  }

  // alignment: share x / y with an existing vertex. Skipped when polar already
  // bent the point, so the ray angle is never fought (polar > alignment).
  if (settings.alignment && !polarApplied) {
    let alignX: Pt | null = null; // vertex supplying the shared x
    let alignY: Pt | null = null; // vertex supplying the shared y
    let bestDX = tolCm;
    let bestDY = tolCm;
    for (const src of sources) {
      for (let i = 0; i < src.points.length; i++) {
        if (i === src.exclude) continue;
        const v = src.points[i];
        const ddx = Math.abs(v.x - point.x);
        if (ddx <= bestDX) {
          bestDX = ddx;
          alignX = v;
        }
        const ddy = Math.abs(v.y - point.y);
        if (ddy <= bestDY) {
          bestDY = ddy;
          alignY = v;
        }
      }
    }
    if (alignX) {
      point = { x: alignX.x, y: point.y };
      type = "alignment";
      guides.push({
        kind: "alignment",
        a: { x: alignX.x, y: alignX.y - GUIDE_REACH_CM },
        b: { x: alignX.x, y: alignX.y + GUIDE_REACH_CM },
      });
    }
    if (alignY) {
      point = { x: point.x, y: alignY.y };
      type = "alignment";
      guides.push({
        kind: "alignment",
        a: { x: alignY.x - GUIDE_REACH_CM, y: alignY.y },
        b: { x: alignY.x + GUIDE_REACH_CM, y: alignY.y },
      });
    }
  }

  if (type) return { point, type, guides };

  // ── Tier 3: grid fallback, else raw cursor ────────────────────────────────
  if (settings.grid) {
    return { point: snapToGrid(cursor, settings.gridStepCm), type: "grid", guides: [] };
  }

  return { point: { ...cursor }, type: null, guides: [] };
}
