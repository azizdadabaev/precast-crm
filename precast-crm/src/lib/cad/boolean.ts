// Boolean operations on room polygons (union / subtract / intersect) via the
// robust `polygon-clipping` library. Converts our cm Pt[] outlines (+ holes)
// to/from the library's ring format and re-snaps the result so float artefacts
// from intersection don't accumulate. Pure + unit-testable.

import polygonClipping from "polygon-clipping";
import type { Pt } from "@/lib/cad/geometry";
import { snapToGrid } from "@/lib/cad/geometry";

type Ring = [number, number][];
type Poly = Ring[]; // [outerRing, ...holeRings]
type MultiPoly = Poly[];

export interface BoolShapeIn {
  points: Pt[];
  holes?: Pt[][];
}
export interface BoolShapeOut {
  points: Pt[];
  holes: Pt[][];
}

/** Close a ring (first === last) in the library's [x,y][] format. */
function closeRing(pts: Pt[]): Ring {
  const r: Ring = pts.map((p) => [p.x, p.y]);
  if (r.length > 0) {
    const a = r[0];
    const b = r[r.length - 1];
    if (a[0] !== b[0] || a[1] !== b[1]) r.push([a[0], a[1]]);
  }
  return r;
}

function toPoly(s: BoolShapeIn): Poly {
  return [closeRing(s.points), ...(s.holes ?? []).map(closeRing)];
}

/** Drop consecutive duplicate points + a trailing point equal to the first. */
function dedupe(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) out.push(p);
  }
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (a.x === b.x && a.y === b.y) out.pop();
  }
  return out;
}

function fromMulti(mp: MultiPoly, gridCm: number): BoolShapeOut[] {
  const snap = (x: number, y: number): Pt =>
    gridCm > 0 ? snapToGrid({ x, y }, gridCm) : { x, y };
  const ringToPts = (ring: Ring): Pt[] =>
    // The library closes its rings (last === first); drop the closing dup, snap.
    dedupe(ring.slice(0, -1).map(([x, y]) => snap(x, y)));

  const out: BoolShapeOut[] = [];
  for (const poly of mp) {
    if (!poly.length) continue;
    const [outer, ...holes] = poly;
    const pts = ringToPts(outer);
    if (pts.length < 3) continue;
    out.push({
      points: pts,
      holes: holes.map(ringToPts).filter((h) => h.length >= 3),
    });
  }
  return out;
}

/** Union of all shapes → one or more output shapes. gridCm rounds the result. */
export function unionShapes(shapes: BoolShapeIn[], gridCm = 1): BoolShapeOut[] {
  if (shapes.length === 0) return [];
  const polys = shapes.map(toPoly);
  const mp = polygonClipping.union(polys[0], ...polys.slice(1)) as MultiPoly;
  return fromMulti(mp, gridCm);
}

/** `base` minus every shape in `others` (a courtyard/notch → output with holes). */
export function subtractShapes(
  base: BoolShapeIn,
  others: BoolShapeIn[],
  gridCm = 1,
): BoolShapeOut[] {
  const mp = polygonClipping.difference(
    toPoly(base),
    ...others.map(toPoly),
  ) as MultiPoly;
  return fromMulti(mp, gridCm);
}

/** Intersection (overlap) of all shapes. */
export function intersectShapes(shapes: BoolShapeIn[], gridCm = 1): BoolShapeOut[] {
  if (shapes.length < 2) return [];
  const polys = shapes.map(toPoly);
  const mp = polygonClipping.intersection(
    polys[0],
    ...polys.slice(1),
  ) as MultiPoly;
  return fromMulti(mp, gridCm);
}
