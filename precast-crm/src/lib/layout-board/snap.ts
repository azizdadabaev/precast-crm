/**
 * Snap a dragged room rectangle against the rooms already on the board.
 *
 * Per axis, independently, the nearest candidate within the threshold wins:
 *  - contact: the rooms sit one wall thickness apart (moving.left = other.right + wall, …) —
 *    only when they face each other on the other axis, otherwise "beside" means nothing;
 *  - alignment: same edge lines up (left↔left, right↔right, top↔top, bottom↔bottom);
 *  - centre alignment.
 * Ties prefer contact, then edges, then centres. Nothing near → 5 cm grid (unless grid is off).
 */
import { GRID_CM, type CmRect } from "./model";

export type SnapGuide = { axis: "x" | "y"; at: number; from: number; to: number };

type Axis = { lo: number; size: number };
type Candidate = { pos: number; at: number; rank: number; other: CmRect };

function crossOverlap(aLo: number, aSize: number, bLo: number, bSize: number, slack: number): boolean {
  return aLo < bLo + bSize + slack && bLo < aLo + aSize + slack;
}

function best(m: Axis, cands: Candidate[], threshold: number): Candidate | null {
  let pick: Candidate | null = null;
  let pickD = Infinity;
  for (const c of cands) {
    const d = Math.abs(c.pos - m.lo);
    if (d > threshold) continue;
    if (d < pickD - 1e-9 || (Math.abs(d - pickD) <= 1e-9 && pick && c.rank < pick.rank)) {
      pick = c;
      pickD = d;
    }
  }
  return pick;
}

function candidates(m: Axis, o: Axis, other: CmRect, wall: number, facing: boolean): Candidate[] {
  const out: Candidate[] = [];
  if (facing) {
    out.push({ pos: o.lo + o.size + wall, at: o.lo + o.size + wall, rank: 0, other });
    out.push({ pos: o.lo - wall - m.size, at: o.lo - wall, rank: 0, other });
  }
  out.push({ pos: o.lo, at: o.lo, rank: 1, other });
  out.push({ pos: o.lo + o.size - m.size, at: o.lo + o.size, rank: 1, other });
  out.push({ pos: o.lo + o.size / 2 - m.size / 2, at: o.lo + o.size / 2, rank: 2, other });
  return out;
}

export function snapRect(
  moving: CmRect,
  others: CmRect[],
  opts: { wallCm: number; thresholdCm: number; grid?: boolean },
): { x: number; y: number; guides: SnapGuide[] } {
  const { wallCm, thresholdCm } = opts;
  const mx: Axis = { lo: moving.x, size: moving.w };
  const my: Axis = { lo: moving.y, size: moving.h };
  const xs: Candidate[] = [];
  const ys: Candidate[] = [];
  for (const o of others) {
    xs.push(...candidates(mx, { lo: o.x, size: o.w }, o, wallCm, crossOverlap(moving.y, moving.h, o.y, o.h, thresholdCm)));
    ys.push(...candidates(my, { lo: o.y, size: o.h }, o, wallCm, crossOverlap(moving.x, moving.w, o.x, o.w, thresholdCm)));
  }
  const bx = best(mx, xs, thresholdCm);
  const by = best(my, ys, thresholdCm);
  const gridOn = opts.grid !== false;
  const round = (v: number) => (gridOn ? Math.round(v / GRID_CM) * GRID_CM : v);
  const x = bx ? bx.pos : round(moving.x);
  const y = by ? by.pos : round(moving.y);

  const guides: SnapGuide[] = [];
  if (bx) {
    guides.push({ axis: "x", at: bx.at, from: Math.min(y, bx.other.y), to: Math.max(y + moving.h, bx.other.y + bx.other.h) });
  }
  if (by) {
    guides.push({ axis: "y", at: by.at, from: Math.min(x, by.other.x), to: Math.max(x + moving.w, by.other.x + by.other.w) });
  }
  return { x, y, guides };
}
