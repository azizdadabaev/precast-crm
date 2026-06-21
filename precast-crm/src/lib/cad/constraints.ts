// Geometric constraint solver for a room polygon (cm). A lightweight iterative
// PROJECTION solver (Gauss–Seidel style): each pass nudges the non-pinned
// endpoints of every constrained edge toward satisfying its relation; a handful
// of passes converge for the compatible, mostly-rectilinear constraint sets this
// tool uses. Not a general DOF/Jacobian solver — deliberately simple, pure and
// unit-testable. Edge i is points[i] → points[(i+1) % n].

import type { Pt } from "@/lib/cad/geometry";

export type Constraint =
  | { type: "horizontal"; edge: number }
  | { type: "vertical"; edge: number }
  | { type: "equal"; edges: [number, number] }
  | { type: "parallel"; edges: [number, number] }
  | { type: "perpendicular"; edges: [number, number] };

/**
 * Solve `constraints` over `points`, holding `pinned` vertices fixed. Returns a
 * NEW points array; does not mutate. `weight` (0..1) damps each projection so
 * competing constraints settle instead of oscillating.
 */
export function solveConstraints(
  points: Pt[],
  constraints: Constraint[],
  pinned: number[] = [],
  iterations = 24,
  weight = 0.5,
): Pt[] {
  const n = points.length;
  if (n < 2) return points.map((p) => ({ ...p }));
  const pts = points.map((p) => ({ ...p }));
  const fixed = new Set(pinned);

  const A = (e: number) => e % n;
  const B = (e: number) => (e + 1) % n;
  const vec = (e: number): Pt => ({ x: pts[B(e)].x - pts[A(e)].x, y: pts[B(e)].y - pts[A(e)].y });
  const len = (e: number) => Math.hypot(vec(e).x, vec(e).y);
  const mid = (e: number): Pt => ({ x: (pts[A(e)].x + pts[B(e)].x) / 2, y: (pts[A(e)].y + pts[B(e)].y) / 2 });
  const move = (i: number, tx: number, ty: number) => {
    if (fixed.has(i)) return;
    pts[i].x += (tx - pts[i].x) * weight;
    pts[i].y += (ty - pts[i].y) * weight;
  };
  // Re-place edge e's endpoints along unit dir (ux,uy) keeping its length+midpoint.
  const align = (e: number, ux: number, uy: number, length: number) => {
    const m = mid(e);
    move(A(e), m.x - (ux * length) / 2, m.y - (uy * length) / 2);
    move(B(e), m.x + (ux * length) / 2, m.y + (uy * length) / 2);
  };

  for (let it = 0; it < iterations; it++) {
    for (const c of constraints) {
      if (c.type === "horizontal") {
        const y = (pts[A(c.edge)].y + pts[B(c.edge)].y) / 2;
        move(A(c.edge), pts[A(c.edge)].x, y);
        move(B(c.edge), pts[B(c.edge)].x, y);
      } else if (c.type === "vertical") {
        const x = (pts[A(c.edge)].x + pts[B(c.edge)].x) / 2;
        move(A(c.edge), x, pts[A(c.edge)].y);
        move(B(c.edge), x, pts[B(c.edge)].y);
      } else if (c.type === "equal") {
        const [e0, e1] = c.edges;
        const v1 = vec(e1);
        const l1 = Math.hypot(v1.x, v1.y) || 1;
        align(e1, v1.x / l1, v1.y / l1, len(e0)); // e1 length := e0 length
      } else {
        const [e0, e1] = c.edges;
        const v0 = vec(e0);
        const l0 = Math.hypot(v0.x, v0.y) || 1;
        let ux = v0.x / l0;
        let uy = v0.y / l0;
        if (c.type === "perpendicular") {
          const t = ux;
          ux = -uy;
          uy = t;
        }
        const v1 = vec(e1);
        // Keep e1's length + the closer of the two directions (±dir).
        const sign = v1.x * ux + v1.y * uy >= 0 ? 1 : -1;
        align(e1, sign * ux, sign * uy, Math.hypot(v1.x, v1.y));
      }
    }
  }
  return pts;
}

/**
 * "Square up" a near-rectilinear room: constrain every edge to be exactly
 * horizontal or vertical (by its dominant axis), then solve. Turns a hand-drawn
 * almost-orthogonal outline into a clean rectilinear one the bay engine prefers.
 */
export function rectify(points: Pt[]): Pt[] {
  const n = points.length;
  if (n < 3) return points.map((p) => ({ ...p }));
  const constraints: Constraint[] = [];
  for (let e = 0; e < n; e++) {
    const dx = Math.abs(points[(e + 1) % n].x - points[e].x);
    const dy = Math.abs(points[(e + 1) % n].y - points[e].y);
    constraints.push(dx >= dy ? { type: "horizontal", edge: e } : { type: "vertical", edge: e });
  }
  return solveConstraints(points, constraints, [], 40, 0.5);
}
