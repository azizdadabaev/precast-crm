// Pure geometry for the CAD room-layout tool. All polygon points are in CENTIMETRES
// (single source of truth). The room outline is decomposed into axis-aligned
// rectangular "bays"; each bay maps to the EXISTING beam/block engine's
// (inner_width, inner_length) so the counts + pricing stay the proven calculateSlab
// math. No rendering here — pure + unit-testable.

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Direction the beams RUN: "H" = along the x-axis, "V" = along the y-axis. */
export type BeamDir = "H" | "V";

export interface Bay {
  rect: Rect;
  beamDir: BeamDir;
}

/** Signed polygon area (shoelace). Positive = counter-clockwise in math coords. */
export function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return a / 2;
}

export function bbox(pts: Pt[]): Rect {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Length of each edge (pts[i] → pts[i+1], closing back to 0). */
export function edgeLengths(pts: Pt[]): number[] {
  return pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return Math.hypot(q.x - p.x, q.y - p.y);
  });
}

export function snapToGrid(p: Pt, step: number): Pt {
  if (step <= 0) return p;
  return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
}

/** Force the segment prev→p to be axis-aligned, keeping the larger delta's axis. */
export function snapOrtho(prev: Pt, p: Pt): Pt {
  const dx = Math.abs(p.x - prev.x);
  const dy = Math.abs(p.y - prev.y);
  return dx >= dy ? { x: p.x, y: prev.y } : { x: prev.x, y: p.y };
}

/** Beams span the SHORTER side, so they RUN along it: shorter horizontal → "H". */
export function defaultBeamDir(rect: Rect): BeamDir {
  return rect.w <= rect.h ? "H" : "V";
}

/**
 * Decompose a rectilinear room outline (cm corner vertices, not closed/repeated)
 * into minimal axis-aligned rectangles. Coordinates are rounded to integers
 * (cm) for the integer-only library; the outer loop is forced counter-clockwise.
 */
export function decomposeToBays(loop: Pt[]): Rect[] {
  if (loop.length < 4) return [];
  // Vertical-slab decomposition: cut at every distinct vertex x, and within each
  // slab find the inside y-intervals by scanning a vertical line at the slab
  // midpoint against the horizontal edges (even-odd). Each (slab × interval) is a
  // rectangular bay. Correct for any rectilinear polygon; winding-independent.
  const edges: Array<[Pt, Pt]> = loop.map((p, i) => [p, loop[(i + 1) % loop.length]]);
  const xs = Array.from(new Set(loop.map((p) => Math.round(p.x)))).sort((a, b) => a - b);
  const bays: Rect[] = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    const xm = (x0 + x1) / 2;
    const ys: number[] = [];
    for (const [a, b] of edges) {
      if (a.y !== b.y) continue; // only horizontal edges cross a vertical scan line
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      if (xm > lo && xm < hi) ys.push(a.y);
    }
    ys.sort((p, q) => p - q);
    for (let k = 0; k + 1 < ys.length; k += 2) {
      const y0 = ys[k];
      const y1 = ys[k + 1];
      if (y1 > y0) bays.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
  }
  return bays;
}

/**
 * Map a bay to the existing engine's inputs (in METRES). `inner_width` is the
 * extent the beams span (beam_length = inner_width + 2×bearing); `inner_length`
 * is the perpendicular extent the beams are spaced along (pitches = floor(
 * inner_length / PITCH)). Beams run along beamDir, so the along-beamDir extent
 * is the span → inner_width.
 */
export function bayToSlabInput(bay: Bay): { inner_width: number; inner_length: number } {
  const wM = bay.rect.w / 100;
  const hM = bay.rect.h / 100;
  return bay.beamDir === "H"
    ? { inner_width: wM, inner_length: hM }
    : { inner_width: hM, inner_length: wM };
}
