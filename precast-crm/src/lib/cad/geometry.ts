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

// Engine constants mirrored in CM for the visual overlay. Kept local (not
// imported from the engine) so this module stays pure-geometry with no
// service dependency; values match calculation-engine.ts BEAM_WIDTH / BLOCK_LENGTH.
const BEAM_WIDTH_CM = 12; // BEAM_WIDTH 0.12 m
const BLOCK_LENGTH_CM = 20; // BLOCK_LENGTH 0.20 m

/**
 * Build the geometric beam/block overlay for a bay, in CM, positioned inside
 * `bay.rect`. The picture is driven by the ENGINE's counts (pass
 * `result.beam_count` and `result.block_rows`) so the drawing matches the
 * numbers. v1 is approximate-but-faithful: beams run ALONG `beamDir`, are each
 * BEAM_WIDTH_CM thick, and are spaced EVENLY across the perpendicular extent;
 * the gaps between them hold `blockRows` rows of block cells, each row
 * subdivided along the run direction into ~BLOCK_LENGTH_CM cells.
 *
 * Geometry only — no pitch math here. The COUNT of beams returned always
 * equals `beamCount`; all rects lie within `bay.rect`.
 */
export function beamLayout(
  bay: Bay,
  beamCount: number,
  blockRows: number,
): { beams: Rect[]; blockCells: Rect[] } {
  const { x, y, w, h } = bay.rect;
  const beams: Rect[] = [];
  const blockCells: Rect[] = [];
  if (beamCount <= 0 || w <= 0 || h <= 0) return { beams, blockCells };

  // "perp" is the axis the beams are spaced along; "run" is the axis they span.
  // H → beams run along x (span = w), spaced along y (perp = h).
  // V → beams run along y (span = h), spaced along x (perp = w).
  const horizontal = bay.beamDir === "H";
  const runSpan = horizontal ? w : h;
  const perpSpan = horizontal ? h : w;

  // Evenly distribute `beamCount` strips of BEAM_WIDTH_CM across the perp extent.
  // Slot centres at (i + 0.5) / beamCount of the span; clamp so a thick beam in
  // a thin bay still lands fully inside.
  const beamThick = Math.min(BEAM_WIDTH_CM, perpSpan);
  for (let i = 0; i < beamCount; i++) {
    const centre = ((i + 0.5) / beamCount) * perpSpan;
    let off = centre - beamThick / 2;
    off = Math.max(0, Math.min(off, perpSpan - beamThick));
    beams.push(
      horizontal
        ? { x, y: y + off, w: runSpan, h: beamThick }
        : { x: x + off, y, w: beamThick, h: runSpan },
    );
  }

  // Block cells: `blockRows` rows evenly spaced across the perp extent, each
  // subdivided into ceil(runSpan / BLOCK_LENGTH_CM) cells along the run axis.
  const cols = Math.max(1, Math.ceil(runSpan / BLOCK_LENGTH_CM));
  const cellRun = runSpan / cols;
  const rowThick = perpSpan / Math.max(1, blockRows);
  for (let r = 0; r < blockRows; r++) {
    const perpOff = r * rowThick;
    for (let c = 0; c < cols; c++) {
      const runOff = c * cellRun;
      blockCells.push(
        horizontal
          ? { x: x + runOff, y: y + perpOff, w: cellRun, h: rowThick }
          : { x: x + perpOff, y: y + runOff, w: rowThick, h: cellRun },
      );
    }
  }

  return { beams, blockCells };
}
