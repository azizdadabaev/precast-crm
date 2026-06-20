// Scanline beam engine for ARBITRARY room polygons (cm coordinates).
//
// The existing `decomposeToBays` (in geometry.ts) only handles axis-aligned
// rectilinear outlines — it filters to horizontal edges and silently drops any
// diagonal/angled wall, collapsing a tapered room to one wrong rectangular bay.
//
// This module instead casts scan lines at the beam PITCH along the axis the
// beams are spaced on, and intersects each line with ALL polygon edges
// (diagonals included). Every "inside" interval on a line is one beam, whose
// length follows the room's true width at that position. This gives correct
// per-beam lengths for rectilinear, tapered/trapezoidal AND L-shaped rooms
// (a notch yields two beams on one line; a taper yields gradually changing
// lengths). Pure + unit-testable — no rendering, no engine dependency.

import type { Pt, Rect } from "./geometry";
import {
  PITCH_CM,
  BEAM_WIDTH_CM,
  BEARING_CM,
  BLOCK_VISIBLE_CM,
  BLOCK_LENGTH_CM,
  isAxisAligned,
} from "./geometry";

/** One beam produced by the scanline cast. All values in CM. */
export interface ScanBeam {
  /** Position along the spacing (perpendicular) axis — the scan-line coord. */
  pos: number;
  /** Interval start of the clear inside span on the scan line (run axis). */
  spanStart: number;
  /** Interval end of the clear inside span on the scan line (run axis). */
  spanEnd: number;
  /** Beam length = (spanEnd − spanStart) + 2 × bearing. */
  lengthCm: number;
}

export interface ScanResult {
  beams: ScanBeam[];
}

/** One cut-list row: `qty` beams all rounded to the same stock `lengthCm`. */
export interface BeamScheduleRow {
  lengthCm: number;
  qty: number;
}

/**
 * Is every edge of the closed loop axis-aligned (horizontal or vertical)?
 * The hybrid page routes a rectilinear outline through the exact
 * `decompose → bay → calculateSlab` path (preserving the golden engine
 * numbers) and only an outline with ANY angled edge through `scanBeams`.
 * A loop with < 3 vertices is treated as NOT rectilinear (degenerate).
 */
export function isRectilinear(loop: Pt[]): boolean {
  const n = loop.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    if (!isAxisAligned(loop[i], loop[(i + 1) % n])) return false;
  }
  return true;
}

/**
 * Intersect the infinite horizontal line `y = yScan` with every edge of the
 * closed polygon and return the SORTED list of x-crossings. Edges exactly
 * horizontal at y=yScan are skipped (they contribute no single crossing). A
 * half-open vertex rule (count an edge only when yScan is in [min, max), i.e.
 * the lower endpoint counts, the upper doesn't) prevents double-counting a
 * vertex shared by two edges. The crossings come in pairs that bound the
 * inside intervals (even-odd fill).
 */
function scanCrossingsX(loop: Pt[], yScan: number): number[] {
  const n = loop.length;
  const xs: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % n];
    const y0 = a.y;
    const y1 = b.y;
    if (y0 === y1) continue; // horizontal edge — no single crossing
    const lo = Math.min(y0, y1);
    const hi = Math.max(y0, y1);
    // Half-open: include the lower y, exclude the upper y.
    if (yScan < lo || yScan >= hi) continue;
    const t = (yScan - y0) / (y1 - y0);
    xs.push(a.x + t * (b.x - a.x));
  }
  xs.sort((p, q) => p - q);
  return xs;
}

/** bbox min/max on each axis for a loop (cm). */
function extent(loop: Pt[]): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of loop) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Cast beams across ANY closed polygon at the given pitch.
 *
 *  - `beamDir "H"`: beams RUN along x, spaced along y → scan lines are
 *    horizontal (y = const), cast top-to-bottom every `pitchCm`.
 *  - `beamDir "V"`: beams RUN along y, spaced along x → we transpose the loop
 *    (swap x↔y), run the same horizontal-scan logic, then map each beam back
 *    (its `pos` becomes an x, its span an interval along y).
 *
 * Scan-line placement mirrors the production engine's grid: the first line sits
 * half a beam-width (BEAM_WIDTH_CM/2) in from the near wall, then every
 * `pitchCm` until past the far wall. Each inside interval on a line becomes one
 * beam; its `lengthCm` is the clear span plus `2 × bearingCm` (the wall seats),
 * matching the engine's `beam_length = inner_width + 2 × bearing`.
 *
 * Degenerate inputs (< 3 vertices, non-positive pitch, zero extent) yield no
 * beams.
 */
export function scanBeams(
  loop: Pt[],
  beamDir: "H" | "V",
  pitchCm: number = PITCH_CM,
  bearingCm: number = BEARING_CM,
): ScanResult {
  if (loop.length < 3 || !(pitchCm > 0)) return { beams: [] };

  // Transpose for vertical beams so the core always scans horizontal lines.
  const work = beamDir === "V" ? loop.map((p) => ({ x: p.y, y: p.x })) : loop;
  const { minY, maxY } = extent(work);
  if (!(maxY > minY)) return { beams: [] };

  const beams: ScanBeam[] = [];
  const half = BEAM_WIDTH_CM / 2;
  // First scan line half a beam-width in from the near wall; march by pitch.
  // Guard the loop count so a pathological pitch can't spin forever.
  const maxLines = Math.ceil((maxY - minY) / pitchCm) + 4;
  for (let i = 0; i <= maxLines; i++) {
    const yScan = minY + half + i * pitchCm;
    if (yScan >= maxY) break;
    const xs = scanCrossingsX(work, yScan);
    // Crossings pair up into inside intervals (even-odd).
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = xs[k];
      const x1 = xs[k + 1];
      const span = x1 - x0;
      if (span <= 1e-6) continue;
      beams.push({
        pos: yScan,
        spanStart: x0,
        spanEnd: x1,
        lengthCm: span + 2 * bearingCm,
      });
    }
  }
  return { beams };
}

/** Stock beam length quantum (cm). Beams are cut/grouped to this increment.
 *  Matches the tapered engine's BEAM_STOCK_STEP (0.05 m → 5 cm). */
export const BEAM_STOCK_STEP_CM = 5;

/**
 * Group scanned beams into a cut-list: bucket each beam's length UP to the
 * nearest `stepCm` stock increment (never undercut the clear span), sum the
 * counts, and sort ascending by length. Rounding UP mirrors the tapered
 * engine's `roundUpToStep` — a stock beam must COVER the required member
 * length. Pure + order-independent.
 */
export function beamSchedule(
  beams: ScanBeam[],
  stepCm: number = BEAM_STOCK_STEP_CM,
): BeamScheduleRow[] {
  const step = stepCm > 0 ? stepCm : 1;
  const byLen = new Map<number, number>();
  for (const b of beams) {
    if (!(b.lengthCm > 0)) continue;
    const rounded = Math.ceil(b.lengthCm / step - 1e-9) * step;
    byLen.set(rounded, (byLen.get(rounded) ?? 0) + 1);
  }
  return Array.from(byLen.entries())
    .map(([lengthCm, qty]) => ({ lengthCm, qty }))
    .sort((a, b) => a.lengthCm - b.lengthCm);
}

/** Estimated block tally for a scanned layout. */
export interface BlockEstimate {
  /** Total blocks across all inter-beam rows. */
  totalBlocks: number;
  /** Number of block rows considered (one between each pair of adjacent beams). */
  rows: number;
}

/**
 * Approximate the block count for a scanned (irregular) layout.
 *
 * MODELLING ASSUMPTION (documented): blocks tile the gaps BETWEEN adjacent
 * beams. Between two beams that are roughly `pitchCm` apart on the spacing
 * axis there is one block row whose visible depth is ~BLOCK_VISIBLE_CM; along
 * the run axis the row holds ⌈clearSpan / BLOCK_LENGTH_CM⌉ blocks (same per-row
 * formula the production + tapered engines use). For a tapering room the clear
 * span shrinks row to row, so we take the WIDER of the two bounding beams'
 * clear spans for each gap (round UP — never under-supply). Beams are taken in
 * scan order (already sorted by `pos`). This is an estimate, not a structural
 * BoM; the exact engine path is reserved for true rectangles.
 */
export function blockEstimate(beams: ScanBeam[]): BlockEstimate {
  if (beams.length < 2) return { totalBlocks: 0, rows: 0 };
  const ordered = [...beams].sort((a, b) => a.pos - b.pos);
  let total = 0;
  let rows = 0;
  for (let i = 0; i + 1 < ordered.length; i++) {
    const a = ordered[i];
    const b = ordered[i + 1];
    // Only count a row between beams that actually neighbour on the same
    // scan-interval band (overlapping run spans) — skip a jump across a notch
    // where the two beams don't share any run-axis overlap.
    const overlap =
      Math.min(a.spanEnd, b.spanEnd) - Math.max(a.spanStart, b.spanStart);
    if (overlap <= 1e-6) continue;
    const clearSpan = Math.max(a.spanEnd - a.spanStart, b.spanEnd - b.spanStart);
    const perRow = Math.ceil(clearSpan / BLOCK_LENGTH_CM);
    total += perRow;
    rows += 1;
  }
  return { totalBlocks: total, rows };
}

/** Block visible depth re-export for callers documenting the row depth. */
export const SCAN_BLOCK_VISIBLE_CM = BLOCK_VISIBLE_CM;

/** Beam strips + block cells (WORLD-cm Rects) for the canvas overlay. Same shape
 *  the rectilinear `beamLayout` feeds `<RoomCanvas beamLayers={…}>`, so the
 *  tapered drawing reuses the exact strip/cell rendering + styling. */
export interface ScanOverlay {
  beams: Rect[];
  blockCells: Rect[];
}

/**
 * Turn a `scanBeams` result into drawable WORLD-cm Rects so the tapered/angled
 * path can render on the canvas the same way the rectilinear path does.
 *
 * COORDINATE MAPPING (mirrors `scanBeams`):
 *  - "H": beams RUN along x, spaced along y → a scan beam at `pos` (world y),
 *    spanning `spanStart…spanEnd` (world x), is a horizontal strip of thickness
 *    BEAM_WIDTH_CM centred on `pos`:
 *      { x: spanStart, y: pos − w/2, w: span, h: BEAM_WIDTH_CM }.
 *  - "V": `scanBeams` transposed the loop, so the returned `pos` is along world x
 *    and the span is along world y → a vertical strip of width BEAM_WIDTH_CM
 *    centred on `pos`:
 *      { x: pos − w/2, y: spanStart, w: BEAM_WIDTH_CM, h: span }.
 * Either way the strip lands inside the real (un-transposed) polygon.
 *
 * BLOCK CELLS: between each adjacent pair of beams (in `pos` order) we fill the
 * OVERLAPPING run interval — `[max(start), min(end)]` — with cells ≈
 * BLOCK_LENGTH_CM long along the run × the inter-beam GAP deep (the clear gap
 * between the two facing strip edges). Pairs with no run overlap (e.g. across an
 * L-/U-notch) are skipped, matching `blockEstimate`'s "neighbour on the same
 * band" rule so the picture agrees with the tally. The last cell in a row is
 * clamped to the interval end (no overhang past the narrower beam).
 */
export function scanBeamsToOverlay(
  scan: ScanResult,
  beamDir: "H" | "V",
): ScanOverlay {
  const half = BEAM_WIDTH_CM / 2;
  const horizontal = beamDir === "H";

  // Strip Rect for one scan beam, oriented by beamDir back to world coords.
  const stripOf = (b: ScanBeam): Rect =>
    horizontal
      ? { x: b.spanStart, y: b.pos - half, w: b.spanEnd - b.spanStart, h: BEAM_WIDTH_CM }
      : { x: b.pos - half, y: b.spanStart, w: BEAM_WIDTH_CM, h: b.spanEnd - b.spanStart };

  const beams = scan.beams.map(stripOf);

  // Block cells fill the gap between each adjacent (pos-sorted) beam pair, over
  // the run interval the two beams share. Mirrors `blockEstimate`'s assumptions.
  const ordered = [...scan.beams].sort((a, b) => a.pos - b.pos);
  const blockCells: Rect[] = [];
  for (let i = 0; i + 1 < ordered.length; i++) {
    const a = ordered[i];
    const b = ordered[i + 1];
    const runStart = Math.max(a.spanStart, b.spanStart);
    const runEnd = Math.min(a.spanEnd, b.spanEnd);
    if (runEnd - runStart <= 1e-6) continue; // no shared run band → skip (notch)
    // The clear gap between the two facing strip edges (perp/spacing axis).
    const gapStart = a.pos + half;
    const gapDepth = b.pos - half - gapStart;
    if (gapDepth <= 1e-6) continue;
    // Tile the run interval in ~BLOCK_LENGTH_CM steps, clamping the last cell.
    for (let x = runStart; x < runEnd - 1e-6; x += BLOCK_LENGTH_CM) {
      const len = Math.min(BLOCK_LENGTH_CM, runEnd - x);
      blockCells.push(
        horizontal
          ? { x, y: gapStart, w: len, h: gapDepth }
          : { x: gapStart, y: x, w: gapDepth, h: len },
      );
    }
  }

  return { beams, blockCells };
}
