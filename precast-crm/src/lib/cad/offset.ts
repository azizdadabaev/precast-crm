// Miter-offset a simple closed polygon. Used to draw a constant-width ring beam
// (e.g. 15 cm) around an inner room outline. Pure geometry — same CENTIMETRE,
// screen/world y-DOWN convention as ./geometry.ts.

import type { Pt } from "@/lib/cad/geometry";

/** Signed polygon area (shoelace). Sign encodes the winding. */
function signedArea(loop: Pt[]): number {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const j = (i + 1) % loop.length;
    a += loop[i].x * loop[j].y - loop[j].x * loop[i].y;
  }
  return a / 2;
}

/**
 * Offset a simple closed polygon OUTWARD by `distCm` (e.g. a 15 cm ring beam
 * around an inner room outline). Returns one new vertex per input vertex
 * (same length, same order). Works for convex AND re-entrant (L/T/U) rectilinear
 * rooms and general simple polygons. distCm > 0 grows the polygon outward
 * regardless of the input winding (CW or CCW).
 */
export function offsetPolygonOutward(loop: Pt[], distCm: number): Pt[] {
  const n = loop.length;
  // Degenerate / no-op: hand back a fresh copy so callers can mutate freely.
  if (n < 3 || !Number.isFinite(distCm) || distCm === 0) {
    return loop.map((p) => ({ x: p.x, y: p.y }));
  }

  // Winding sign. In our y-DOWN screen convention a positive shoelace area means
  // the loop is wound so that the OUTWARD normal of edge A→B (unit dir u) is
  // (uy, -ux); a negative area flips it to (-uy, ux). Pinned by the rectangle
  // test: CCW screen rect (0,0)→(400,0)→… has positive area and its top edge
  // (dir (1,0)) must point outward UP = (0,-1) = (uy,-ux). ✓
  const sign = signedArea(loop) >= 0 ? 1 : -1;

  // Per-edge outward unit normal (edge i runs loop[i] → loop[i+1]). A degenerate
  // (zero-length) edge gets a zero normal; the vertex fallback handles it.
  const normals: Pt[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % n];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.hypot(ex, ey);
    if (len < 1e-9) {
      normals[i] = { x: 0, y: 0 };
      continue;
    }
    const ux = ex / len;
    const uy = ey / len;
    normals[i] = { x: sign * uy, y: sign * -ux };
  }

  // Each output vertex k is the intersection of the two offset lines for the
  // edges meeting at vertex k: edge (k-1) [loop[k-1]→loop[k]] and edge k
  // [loop[k]→loop[k+1]]. Both offset lines are shifted by distCm along their
  // outward normal.
  const out: Pt[] = new Array(n);
  for (let k = 0; k < n; k++) {
    const prev = (k - 1 + n) % n;
    const n1 = normals[prev];
    const n2 = normals[k];
    const v = loop[k];

    // A point on each offset line + that line's direction (the edge direction).
    const p1 = { x: v.x + n1.x * distCm, y: v.y + n1.y * distCm };
    const d1 = { x: loop[k].x - loop[prev].x, y: loop[k].y - loop[prev].y };
    const p2 = { x: v.x + n2.x * distCm, y: v.y + n2.y * distCm };
    const d2 = { x: loop[(k + 1) % n].x - loop[k].x, y: loop[(k + 1) % n].y - loop[k].y };

    // Solve p1 + t·d1 = p2 + s·d2 for t. cross = d1 × d2; near-zero → parallel.
    const cross = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(cross) < 1e-9) {
      // Near-parallel (collinear / straight-through) vertex: no miter, just push
      // the shared vertex along the averaged outward normal (avoids a spike).
      const ax = n1.x + n2.x;
      const ay = n1.y + n2.y;
      const al = Math.hypot(ax, ay);
      const nx = al < 1e-9 ? n2.x : ax / al;
      const ny = al < 1e-9 ? n2.y : ay / al;
      out[k] = { x: v.x + nx * distCm, y: v.y + ny * distCm };
      continue;
    }
    const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / cross;
    out[k] = { x: p1.x + t * d1.x, y: p1.y + t * d1.y };
  }
  return out;
}

/**
 * Offset a simple closed polygon INWARD by `distCm` (the clear inner face of a
 * wall whose outer face is `loop`, thickness distCm). Just the outward offset by
 * a negative distance. For a tight notch + a large thickness the result can
 * self-intersect — callers should validate (isValidOutline) and fall back to the
 * outer loop if so.
 */
export function offsetPolygonInward(loop: Pt[], distCm: number): Pt[] {
  return offsetPolygonOutward(loop, -distCm);
}
