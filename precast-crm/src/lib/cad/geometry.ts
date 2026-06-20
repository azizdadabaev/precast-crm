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

/** Total outline length (cm). `closed` includes the last→first edge. */
export function perimeter(pts: Pt[], closed = true): number {
  if (pts.length < 2) return 0;
  const last = closed ? pts.length : pts.length - 1;
  let sum = 0;
  for (let i = 0; i < last; i++) {
    const q = pts[(i + 1) % pts.length];
    sum += Math.hypot(q.x - pts[i].x, q.y - pts[i].y);
  }
  return sum;
}

/** Floor area of the (closed) outline in cm² — absolute shoelace area. */
export function floorAreaCm2(pts: Pt[]): number {
  return Math.abs(polygonArea(pts));
}

/**
 * Format a CENTIMETRE length as a clean CAD dimension string.
 *  - default: metres with up to `maxDecimals` (trailing zeros trimmed), e.g.
 *    340 → "3.4 m", 622 → "6.22 m", 100 → "1 m".
 *  - `unit:"cm"` prints whole centimetres, e.g. "340 cm".
 * Negative/non-finite inputs are coerced to 0 so labels never read "NaN".
 */
export function formatLengthCm(
  cm: number,
  opts: { unit?: "m" | "cm"; maxDecimals?: number } = {},
): string {
  const { unit = "m", maxDecimals = 2 } = opts;
  const v = Number.isFinite(cm) ? Math.max(0, cm) : 0;
  if (unit === "cm") return `${Math.round(v)} cm`;
  const m = v / 100;
  // Round to maxDecimals, then strip trailing zeros for a tidy label.
  const rounded = Number(m.toFixed(maxDecimals));
  return `${rounded} m`;
}

/**
 * Format a CENTIMETRE length for a CAD dimension tick: whole metres + remaining
 * whole centimetres, e.g. 622 → "6 m 22", 340 → "3 m 40", 300 → "3 m", 45 →
 * "45 cm". This is the long-hand a fabricator reads off a drawing; the compact
 * `formatLengthCm` ("6.22 m") is kept for chips/legends where space is tight.
 * Negative / non-finite inputs coerce to "0 m".
 */
export function formatLengthDual(cm: number): string {
  const v = Number.isFinite(cm) ? Math.max(0, Math.round(cm)) : 0;
  if (v < 100) return `${v} cm`;
  const m = Math.floor(v / 100);
  const rem = v - m * 100;
  return rem === 0 ? `${m} m` : `${m} m ${rem}`;
}

/** Format a cm² area as m² with up to `maxDecimals` (trailing zeros trimmed). */
export function formatAreaCm2(cm2: number, maxDecimals = 2): string {
  const v = Number.isFinite(cm2) ? Math.max(0, cm2) : 0;
  const m2 = v / 10000;
  const rounded = Number(m2.toFixed(maxDecimals));
  return `${rounded} m²`;
}

/**
 * Outward unit normal of edge `i` (pts[i] → pts[i+1]) for a CLOSED polygon,
 * i.e. the direction that points AWAY from the interior — used to place
 * dimension lines just outside the shape. Works for either winding by checking
 * which side the polygon centroid lies on and flipping the normal away from it.
 * Returns {x:0,y:0} for a degenerate (zero-length) edge.
 */
export function outwardNormal(pts: Pt[], i: number): Pt {
  const n = pts.length;
  if (n < 3) return { x: 0, y: 0 };
  const a = pts[i];
  const b = pts[(i + 1) % n];
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const len = Math.hypot(ex, ey);
  if (len < 1e-9) return { x: 0, y: 0 };
  // Left-hand normal of the edge direction (screen y-down agnostic).
  let nx = -ey / len;
  let ny = ex / len;
  // Centroid of the outline; flip the normal to point away from it.
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= n;
  cy /= n;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  // Vector from edge midpoint toward centroid; if the normal points the same
  // way (positive dot), it's inward → negate it.
  if (nx * (cx - mx) + ny * (cy - my) > 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

/**
 * Is point `p` strictly inside (or on the boundary of) the closed polygon?
 * Even-odd ray cast to +x. Boundary points count as inside so a point sampled
 * exactly on an edge isn't mis-classified. Used by `edgeOutwardNormal` to decide
 * which side of an edge is the room interior — correct even for non-convex
 * outlines (e.g. an L-shape's re-entrant notch) where a centroid test fails.
 */
export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  const n = poly.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = poly[i];
    const b = poly[j];
    // On-segment check (cheap, axis-agnostic): collinear + within bbox.
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (
      Math.abs(cross) < 1e-6 &&
      p.x >= Math.min(a.x, b.x) - 1e-6 &&
      p.x <= Math.max(a.x, b.x) + 1e-6 &&
      p.y >= Math.min(a.y, b.y) - 1e-6 &&
      p.y <= Math.max(a.y, b.y) + 1e-6
    ) {
      return true; // on the boundary
    }
    const intersects =
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Outward unit normal of edge `i`, chosen by sampling a test point one unit off
 * the edge midpoint and keeping the side that is OUTSIDE the polygon. Unlike
 * `outwardNormal` (centroid heuristic), this is correct for re-entrant edges of
 * a non-convex outline — the dimension line for a notch wall lands in the notch
 * void, not buried inside the solid. Falls back to `outwardNormal` for a
 * degenerate edge or when both samples land inside (numerical edge case).
 */
export function edgeOutwardNormal(pts: Pt[], i: number): Pt {
  const n = pts.length;
  if (n < 3) return { x: 0, y: 0 };
  const a = pts[i];
  const b = pts[(i + 1) % n];
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const len = Math.hypot(ex, ey);
  if (len < 1e-9) return { x: 0, y: 0 };
  const nx = -ey / len;
  const ny = ex / len;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  // Sample a hair off the midpoint along +normal; if that's inside, flip.
  const eps = Math.max(1e-3, len * 1e-3);
  const probe = { x: mx + nx * eps, y: my + ny * eps };
  if (pointInPolygon(probe, pts)) return { x: -nx, y: -ny };
  return { x: nx, y: ny };
}

export function snapToGrid(p: Pt, step: number): Pt {
  if (step <= 0) return p;
  return { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step };
}

/**
 * Set an axis-aligned edge `points[i] → points[(i+1)%n]` to an exact length (cm),
 * keeping the "from" anchor `points[i]` fixed and the polygon closed + orthogonal.
 *
 * The "to" endpoint B = points[i+1] moves along the edge's own axis by the
 * length delta. Because B's NEXT edge (B→C) is perpendicular, C = points[i+2]
 * must shift by the same delta so that perpendicular edge stays axis-aligned;
 * C's following edge is parallel to ours again, so it simply absorbs the delta
 * as a length change and no further propagation is needed. Thus exactly two
 * vertices (i+1 and i+2) translate rigidly. The edge's direction (sign) is
 * preserved.
 *
 * Near-zero / non-axis-aligned edges snap to the dominant axis; a truly
 * degenerate edge or invalid input returns the points unchanged.
 */
export function setEdgeLength(
  points: Pt[],
  edgeIndex: number,
  newLengthCm: number,
): Pt[] {
  const n = points.length;
  if (n < 3 || edgeIndex < 0 || edgeIndex >= n) return points;
  if (!Number.isFinite(newLengthCm) || newLengthCm < 0) return points;

  const a = points[edgeIndex];
  const b = points[(edgeIndex + 1) % n];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  // Pick the dominant axis (handles slightly-off or near-zero edges gracefully).
  const horizontal = adx >= ady;
  const curLen = horizontal ? adx : ady;
  if (curLen < 1e-9) return points; // truly degenerate — no axis to scale along.

  // Preserve direction: +1 if the edge currently goes in the positive axis dir.
  const sign = horizontal ? Math.sign(dx) || 1 : Math.sign(dy) || 1;
  const deltaX = horizontal ? sign * newLengthCm - dx : 0;
  const deltaY = horizontal ? 0 : sign * newLengthCm - dy;

  // Shift the "to" endpoint (i+1) and the following vertex (i+2) by the delta.
  const i1 = (edgeIndex + 1) % n;
  const i2 = (edgeIndex + 2) % n;
  return points.map((p, idx) => {
    if (idx === i1 || idx === i2) return { x: p.x + deltaX, y: p.y + deltaY };
    return { ...p };
  });
}

/**
 * Offset edge `i` (points[i] → points[(i+1)%n]) PARALLEL to itself by `offsetCm`
 * along its OUTWARD normal (positive = outward). Moves BOTH endpoints by the same
 * normal vector; the two adjacent edges stretch to follow. This is the CAD
 * "grab a wall and slide it" move: the wall keeps its direction (stays parallel),
 * it just shifts perpendicular to itself. Returns a NEW points array (same
 * length); does NOT mutate. A degenerate edge (zero-length normal) is a no-op.
 */
export function moveEdgeParallel(
  points: Pt[],
  i: number,
  offsetCm: number,
  closed: boolean,
): Pt[] {
  const n = points.length;
  if (n < 2 || i < 0 || i >= n) return points.map((p) => ({ ...p }));
  // The closing edge only exists for a closed loop.
  if (!closed && i === n - 1) return points.map((p) => ({ ...p }));
  const nrm = edgeOutwardNormal(points, i);
  const dx = nrm.x * offsetCm;
  const dy = nrm.y * offsetCm;
  const i1 = (i + 1) % n;
  return points.map((p, idx) =>
    idx === i || idx === i1 ? { x: p.x + dx, y: p.y + dy } : { ...p },
  );
}

/**
 * Signed offset (cm) of a free cursor delta projected onto edge `i`'s outward
 * normal — the natural "how far did I drag the wall" scalar (positive = the wall
 * moved outward). Feed this back into `moveEdgeParallel` to slide the edge.
 */
export function edgeDragOffset(
  points: Pt[],
  i: number,
  deltaCm: Pt,
  closed: boolean,
): number {
  const n = points.length;
  if (n < 2 || i < 0 || i >= n) return 0;
  if (!closed && i === n - 1) return 0;
  const nrm = edgeOutwardNormal(points, i);
  return deltaCm.x * nrm.x + deltaCm.y * nrm.y;
}

// ── Angle control: edge bearings + interior angles for tapered/angled walls ──
//
// ANGLE CONVENTION (single source of truth): the bearing of edge i is the
// direction of points[i] → points[(i+1)%n] as atan2(dy, dx) in DEGREES, in
// y-DOWN screen space, normalized to (−180, 180]. So in screen space a bearing
// of 0 points +x (right), 90 points +y (DOWN), 180 points −x (left), and −90
// points −y (UP). The interior angle at a vertex is measured INSIDE the polygon
// in [0, 360); for a convex corner it is < 180.

/** Bearing (deg, (−180,180]) of edge i in y-down screen space. Returns 0 for a
 *  degenerate (zero-length) edge. `closed` is accepted for symmetry with the
 *  rest of the API; the bearing of an existing edge i is independent of it. */
export function edgeBearingDeg(points: Pt[], i: number, closed: boolean): number {
  const n = points.length;
  void closed;
  if (n < 2 || i < 0 || i >= n) return 0;
  const a = points[i];
  const b = points[(i + 1) % n];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 1e-9) return 0;
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  // Normalize to (−180, 180]: atan2 already yields [−180, 180], fold −180 → 180.
  if (deg <= -180) deg += 360;
  return deg;
}

/**
 * Rotate edge i about its START vertex (points[i]) to the absolute bearing `deg`,
 * keeping the edge's current length; only the END vertex (points[i+1]) moves, so
 * the two neighbouring edges stretch to follow. Returns a NEW points array (does
 * not mutate). A no-op (returns a copy of `points`) for an out-of-range index, a
 * degenerate edge, or the non-existent closing edge of an OPEN loop.
 */
export function setEdgeBearing(
  points: Pt[],
  i: number,
  deg: number,
  closed: boolean,
): Pt[] {
  const n = points.length;
  if (n < 2 || i < 0 || i >= n) return points.map((p) => ({ ...p }));
  // The closing edge (last → first) only exists for a closed loop.
  if (!closed && i === n - 1) return points.map((p) => ({ ...p }));
  if (!Number.isFinite(deg)) return points.map((p) => ({ ...p }));
  const a = points[i];
  const b = points[(i + 1) % n];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-9) return points.map((p) => ({ ...p }));
  const rad = (deg * Math.PI) / 180;
  const nb = { x: a.x + Math.cos(rad) * len, y: a.y + Math.sin(rad) * len };
  const i1 = (i + 1) % n;
  return points.map((p, idx) => (idx === i1 ? nb : { ...p }));
}

/**
 * Point at distance `distCm` and absolute bearing `bearingDeg` from `origin`, in
 * the editor's y-DOWN screen convention (bearing 0 → +x, 90 → +y/down, −90 →
 * −y/up, 180 → −x). The inverse of `edgeBearingDeg`; used by direct
 * distance/angle entry (CAD "DDE") to place the next vertex precisely.
 */
export function pointFromPolar(origin: Pt, distCm: number, bearingDeg: number): Pt {
  const rad = (bearingDeg * Math.PI) / 180;
  return {
    x: origin.x + Math.cos(rad) * distCm,
    y: origin.y + Math.sin(rad) * distCm,
  };
}

/**
 * Interior angle (deg, [0, 360)) at vertex i — the angle INSIDE the polygon
 * between the incoming edge (i−1, reversed) and the outgoing edge (i). Computed
 * from the unsigned angle between the two incident edge vectors, then flipped to
 * the reflex side when the corner turns against the polygon's winding (so a
 * re-entrant notch reads > 180). Returns 0 for a degenerate corner.
 */
export function interiorAngleDeg(points: Pt[], i: number): number {
  const n = points.length;
  if (n < 3 || i < 0 || i >= n) return 0;
  const prev = points[(i - 1 + n) % n];
  const cur = points[i];
  const next = points[(i + 1) % n];
  // Vectors from the corner to each neighbour.
  const ux = prev.x - cur.x;
  const uy = prev.y - cur.y;
  const vx = next.x - cur.x;
  const vy = next.y - cur.y;
  const lu = Math.hypot(ux, uy);
  const lv = Math.hypot(vx, vy);
  if (lu < 1e-9 || lv < 1e-9) return 0;
  // Unsigned angle between the two edge vectors, in [0, 180].
  let cos = (ux * vx + uy * vy) / (lu * lv);
  cos = Math.max(-1, Math.min(1, cos));
  const between = (Math.acos(cos) * 180) / Math.PI;
  // Decide which side (the ≤180 or the reflex >180) is the interior. The signed
  // cross of (cur→next) about (cur→prev) tells us the turn direction at this
  // corner; comparing it to the polygon's winding (shoelace sign) reveals a
  // re-entrant (reflex) corner, whose interior angle is 360 − between.
  const cross = ux * vy - uy * vx; // (cur→prev) × (cur→next)
  const winding = Math.sign(polygonArea(points)) || 1;
  // At a CONVEX corner the turn (cross sign) runs OPPOSITE to the polygon's
  // winding sign, so the unsigned `between` is already the interior angle; when
  // they MATCH the corner is re-entrant (reflex) and the interior is 360 −
  // between. (Verified against the test square + trapezoid.)
  if (Math.sign(cross) === winding) return 360 - between;
  return between;
}

/** Force the segment prev→p to be axis-aligned, keeping the larger delta's axis. */
export function snapOrtho(prev: Pt, p: Pt): Pt {
  const dx = Math.abs(p.x - prev.x);
  const dy = Math.abs(p.y - prev.y);
  return dx >= dy ? { x: p.x, y: prev.y } : { x: prev.x, y: p.y };
}

/**
 * One edge's resolved dimension rendering, in the abstract (unit-agnostic) terms
 * the renderer turns into px. Computed purely from the on-screen edge length so
 * it is testable without a DOM:
 *  - `style:"inline"`  — long edge: arrows point inward at the two tips, text
 *     sits in a gap punched in the dimension line.
 *  - `style:"outside"` — short edge: the text would not fit between inward
 *     arrows, so arrows point INWARD-from-OUTSIDE (tips meeting the extension
 *     lines from beyond) and the text is parked just past one tip. Standard CAD
 *     small-dimension handling; prevents arrowhead/text collisions.
 *  - `style:"bare"`    — too small even for outside arrows: a floating number.
 * `textOffsetPx` is how far past the tip (along the dim line) to park the label
 * in the "outside" case (0 otherwise).
 */
export interface DimStyle {
  style: "inline" | "outside" | "bare";
  /** Half-width (px) of the text gap to punch for the inline case. */
  gapHalfPx: number;
  /** Shift (px) along the dim line to park the label for the outside case. */
  textOffsetPx: number;
}

/**
 * Decide how to render an edge's dimension from its on-screen length (px) and
 * the space the marks need. `textHalfPx` is half the rendered label width,
 * `arrowLenPx` the arrowhead length, `minEdgePx` the floor below which we give
 * up on lines entirely. Pure — the renderer feeds it measured px and gets back
 * the layout decision, keeping the overlap logic in one tested place.
 */
export function dimStyleForEdge(
  edgePx: number,
  textHalfPx: number,
  arrowLenPx: number,
  minEdgePx: number,
): DimStyle {
  if (edgePx < minEdgePx) {
    return { style: "bare", gapHalfPx: 0, textOffsetPx: 0 };
  }
  // Inline needs room for: text gap + an arrow each side + a hair of line.
  const needInline = 2 * textHalfPx + 2 * arrowLenPx + 4;
  if (edgePx >= needInline) {
    return { style: "inline", gapHalfPx: textHalfPx, textOffsetPx: 0 };
  }
  // Otherwise park the label outside the right-hand tip.
  return {
    style: "outside",
    gapHalfPx: 0,
    textOffsetPx: arrowLenPx + textHalfPx + 3,
  };
}

/**
 * Screen-rotation (degrees, clockwise — SVG convention) to align a dimension
 * label with the edge a→b so an angled wall's number reads ALONG its dimension
 * line, exactly like a straight wall's. The raw edge angle is atan2(dy,dx); we
 * fold it into (-90°, 90°] by flipping 180° when it would render the text
 * upside-down, so labels always stay upright/readable regardless of edge
 * direction. A horizontal edge returns 0 (matching the existing straight-wall
 * look); a vertical edge returns 0 too so its label stays horizontal exactly as
 * the current straight-wall rendering draws it — only genuinely DIAGONAL edges
 * get a non-zero tilt. Pure — operates on screen-space points the renderer
 * already has.
 */
export function dimLabelAngleDeg(a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 1e-9) return 0;
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  // Keep upright: collapse to the (-90, 90] half so text never reads inverted.
  if (deg > 90) deg -= 180;
  else if (deg <= -90) deg += 180;
  // Axis-aligned edges keep the existing horizontal label (H ≈ 0, V folds to
  // ±90 → snap to 0) so straight-wall dimensions render byte-identically; only
  // diagonal edges tilt. ~1° tolerance absorbs hand-drawn near-axis wobble.
  if (Math.abs(deg) < 1 || Math.abs(Math.abs(deg) - 90) < 1) return 0;
  return deg;
}

/**
 * Overall (extents) dimensions of the outline: the bounding-box width and
 * height in cm, with the world-space spans they should be drawn against. A real
 * CAD drawing stacks these OUTSIDE the per-edge dimensions so the reader gets
 * the total footprint at a glance — especially for a non-convex outline (an
 * L-shape) where no single edge gives the overall width/height.
 *
 *  - `width`  is measured along the BOTTOM of the bbox (y = bbox.y + h): from
 *    (x0, yBottom) to (x1, yBottom), pointing DOWN-and-out (away from the shape).
 *  - `height` is measured along the RIGHT of the bbox (x = bbox.x + w): from
 *    (xRight, y0) to (xRight, y1), pointing RIGHT-and-out.
 *
 * Returns null spans for a degenerate (zero-area / <3-vertex) outline so the
 * renderer can skip them. Pure: spans are world cm; the renderer maps to px and
 * pushes them past the per-edge dimension band.
 */
export interface OverallDim {
  /** Length in cm of the span (bbox width or height). */
  lengthCm: number;
  /** World-space endpoints of the measured span (along the bbox edge). */
  a: Pt;
  b: Pt;
  /** Outward unit normal (the side to push the dimension line toward). */
  outward: Pt;
}

export function overallDimensions(
  pts: Pt[],
): { width: OverallDim; height: OverallDim } | null {
  if (pts.length < 3) return null;
  const box = bbox(pts);
  if (box.w < 1e-6 || box.h < 1e-6) return null;
  const x0 = box.x;
  const x1 = box.x + box.w;
  const y0 = box.y;
  const y1 = box.y + box.h;
  return {
    // Width along the bottom edge, pushed further DOWN (+y) than per-edge dims.
    width: {
      lengthCm: box.w,
      a: { x: x0, y: y1 },
      b: { x: x1, y: y1 },
      outward: { x: 0, y: 1 },
    },
    // Height along the right edge, pushed further RIGHT (+x).
    height: {
      lengthCm: box.h,
      a: { x: x1, y: y0 },
      b: { x: x1, y: y1 },
      outward: { x: 1, y: 0 },
    },
  };
}

/**
 * Assign each edge a non-negative stacking LEVEL so that parallel dimension
 * lines sharing the same outward side+axis don't draw on top of one another.
 * Two edges collide when (a) their outward normals point the same cardinal way
 * AND (b) their spans overlap when projected onto the shared dimension axis.
 * Colliding edges get successive levels (0,1,2,…); the renderer offsets a level-
 * k dimension by `baseOffset + k·levelStep`. This is what keeps an L-shape's two
 * collinear top edges — and a notch wall that lines up with an outer wall — from
 * stacking their numbers in the same band.
 *
 * `outwardOf(i)` supplies edge i's outward normal (caller passes
 * `edgeOutwardNormal` for a closed loop; for an open path a consistent side).
 * Only axis-aligned outward normals are grouped; a non-cardinal normal (a
 * diagonal edge) always gets level 0. Pure + greedy: O(n²), fine for hand-drawn
 * outlines. Returns an array of levels index-aligned with the edges.
 */
export function dimensionOffsetLevels(
  pts: Pt[],
  outwardOf: (i: number) => Pt,
): number[] {
  const n = pts.length;
  const levels = new Array<number>(n).fill(0);
  if (n < 3) return levels;
  // Classify each edge by its outward cardinal side, and record the interval it
  // occupies on the perpendicular (sweep) axis + its position on the offset axis.
  type Info = {
    side: "up" | "down" | "left" | "right" | null;
    lo: number; // interval start on the sweep axis
    hi: number; // interval end on the sweep axis
    pos: number; // coordinate on the offset axis (the line the dim sits on)
  };
  const info: Info[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const out = outwardOf(i);
    const ax = Math.abs(out.x);
    const ay = Math.abs(out.y);
    let side: Info["side"] = null;
    let lo = 0;
    let hi = 0;
    let pos = 0;
    if (ay > ax && ay > 1e-6) {
      // Horizontal edge → outward is up/down; sweep axis is x, offset axis is y.
      side = out.y < 0 ? "up" : "down";
      lo = Math.min(a.x, b.x);
      hi = Math.max(a.x, b.x);
      pos = (a.y + b.y) / 2;
    } else if (ax > ay && ax > 1e-6) {
      // Vertical edge → outward is left/right; sweep axis is y, offset axis is x.
      side = out.x < 0 ? "left" : "right";
      lo = Math.min(a.y, b.y);
      hi = Math.max(a.y, b.y);
      pos = (a.x + b.x) / 2;
    }
    info.push({ side, lo, hi, pos });
  }
  // Greedy level assignment per side group: an edge takes the lowest level not
  // used by an already-placed edge of the SAME side whose sweep interval overlaps.
  for (let i = 0; i < n; i++) {
    if (!info[i].side) continue;
    const used = new Set<number>();
    for (let j = 0; j < i; j++) {
      if (info[j].side !== info[i].side) continue;
      // Overlap on the sweep axis (touching endpoints don't collide).
      const overlap = info[i].lo < info[j].hi - 1e-6 && info[j].lo < info[i].hi - 1e-6;
      // Same offset line (collinear) also shouldn't double-stack labels even
      // when their sweep intervals merely abut.
      const sameLine = Math.abs(info[i].pos - info[j].pos) <= 1e-6;
      if (overlap || (sameLine && info[i].lo < info[j].hi + 1e-6 && info[j].lo < info[i].hi + 1e-6)) {
        used.add(levels[j]);
      }
    }
    let lvl = 0;
    while (used.has(lvl)) lvl++;
    levels[i] = lvl;
  }
  return levels;
}

// ── Editing geometry: segment math, edge insertion, self-intersection guard ──

/** Squared distance from point p to segment a→b, plus the closest point on it. */
export function pointSegment(p: Pt, a: Pt, b: Pt): { dist: number; t: number; closest: Pt } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const closest = { x: a.x + t * abx, y: a.y + t * aby };
  return { dist: Math.hypot(p.x - closest.x, p.y - closest.y), t, closest };
}

/**
 * Find the polygon/polyline edge whose body (not its endpoints) is nearest to
 * `p` within `tolCm`. Returns the edge index (points[i] → points[i+1]) and the
 * snapped insertion point on that edge, or null if none qualifies. Endpoints are
 * excluded (t in a small interior band) so this never competes with vertex hits.
 */
export function nearestEdge(
  points: Pt[],
  p: Pt,
  tolCm: number,
  closed: boolean,
): { index: number; at: Pt } | null {
  const n = points.length;
  const last = closed ? n : n - 1;
  let best: { index: number; at: Pt; dist: number } | null = null;
  for (let i = 0; i < last; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const { dist, t, closest } = pointSegment(p, a, b);
    if (t <= 0.001 || t >= 0.999) continue; // skip near-endpoint hits
    if (dist <= tolCm && (!best || dist < best.dist)) {
      best = { index: i, at: closest, dist };
    }
  }
  return best ? { index: best.index, at: best.at } : null;
}

/**
 * Smallest edge length (cm) the editor will allow. Drawing/dragging/inserting a
 * vertex that would create an edge shorter than this is rejected as degenerate,
 * so the outline never ends up with a zero-length or hairline edge that the bay
 * decomposition / engine can't make sense of.
 */
export const MIN_EDGE_CM = 1;

/** Squared distance between two points (cheaper than `Math.hypot` for compares). */
function dist2(a: Pt, b: Pt): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Insert a new vertex `at` immediately after `index` (i.e. splitting that edge).
 * Refuses (returns the points unchanged) when `index` is out of range or when
 * `at` coincides with either endpoint of the split edge within `minLenCm`, which
 * would create a zero-length / hairline edge.
 */
export function insertVertex(
  points: Pt[],
  index: number,
  at: Pt,
  minLenCm: number = MIN_EDGE_CM,
): Pt[] {
  const n = points.length;
  if (index < 0 || index >= n) return points;
  const a = points[index];
  const b = points[(index + 1) % n];
  const min2 = minLenCm * minLenCm;
  // Don't drop a point right on top of either endpoint of the edge being split.
  if (dist2(at, a) < min2 || dist2(at, b) < min2) return points;
  const out = points.slice();
  out.splice(index + 1, 0, { x: at.x, y: at.y });
  return out;
}

/**
 * Remove vertex `index`. Refuses to drop below 3 points for a closed loop (or 1
 * while drawing). Also refuses when removing the vertex would collapse its two
 * former neighbours onto each other (a zero-length edge).
 */
export function deleteVertex(points: Pt[], index: number, closed: boolean): Pt[] {
  const n = points.length;
  const min = closed ? 3 : 1;
  if (n <= min || index < 0 || index >= n) return points;
  // After removal, the neighbours either side of `index` become adjacent. For a
  // closed loop (or an interior open vertex) reject if they'd coincide.
  if (closed || (index > 0 && index < n - 1)) {
    const prev = points[(index - 1 + n) % n];
    const next = points[(index + 1) % n];
    if (dist2(prev, next) < MIN_EDGE_CM * MIN_EDGE_CM) return points;
  }
  return points.filter((_, i) => i !== index);
}

/**
 * Would moving the vertex at `moveIdx` to `to` create an edge shorter than
 * `minLenCm` against either of its neighbours? Guards drags / nudges / length
 * edits from collapsing an edge to (near) zero. For an open polyline the missing
 * neighbour (at an endpoint) is simply skipped.
 */
export function wouldCollapseEdge(
  points: Pt[],
  moveIdx: number,
  to: Pt,
  closed: boolean,
  minLenCm: number = MIN_EDGE_CM,
): boolean {
  const n = points.length;
  if (n < 2 || moveIdx < 0 || moveIdx >= n) return false;
  const min2 = minLenCm * minLenCm;
  const hasPrev = closed || moveIdx > 0;
  const hasNext = closed || moveIdx < n - 1;
  if (hasPrev && dist2(to, points[(moveIdx - 1 + n) % n]) < min2) return true;
  if (hasNext && dist2(to, points[(moveIdx + 1) % n]) < min2) return true;
  return false;
}

/** Is edge a→b axis-aligned (horizontal or vertical) within `tol` cm? A zero-
 *  length edge is treated as NOT axis-aligned (no axis to preserve). */
export function isAxisAligned(a: Pt, b: Pt, tol = 1e-6): boolean {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (dx <= tol && dy <= tol) return false;
  return dx <= tol || dy <= tol;
}

/**
 * Rectilinear-preserving vertex move. On an axis-aligned (rectilinear) outline,
 * dragging vertex `moveIdx` to a free target `to` would normally tilt its two
 * incident edges off-axis. To keep the outline rectilinear — the invariant the
 * bay decomposition relies on — we drag the two NEIGHBOUR vertices along with it:
 * the previous neighbour keeps the prev→moved edge on its original axis, the next
 * neighbour keeps the moved→next edge on its original axis.
 *
 *  - If the prev→moved edge was HORIZONTAL (shared y), the prev neighbour takes
 *    the moved vertex's new y (so the edge stays horizontal); if it was VERTICAL
 *    (shared x), the prev neighbour takes the new x.
 *  - Symmetrically for the moved→next edge and the next neighbour.
 *
 * Returns a NEW points array. Only moves neighbours whose incident edge was
 * actually axis-aligned (so a non-rectilinear edge is left untouched and the
 * moved vertex simply translates). For an open polyline the missing endpoint
 * neighbour is skipped. Does not itself validate collapse/intersection — callers
 * combine it with `wouldCollapseEdge` / `wouldSelfIntersect`.
 */
export function orthoVertexMove(
  points: Pt[],
  moveIdx: number,
  to: Pt,
  closed: boolean,
): Pt[] {
  const n = points.length;
  if (moveIdx < 0 || moveIdx >= n) return points.slice();
  const out = points.map((p) => ({ ...p }));
  out[moveIdx] = { x: to.x, y: to.y };

  const hasPrev = closed || moveIdx > 0;
  const hasNext = closed || moveIdx < n - 1;
  const prevIdx = (moveIdx - 1 + n) % n;
  const nextIdx = (moveIdx + 1) % n;
  const orig = points[moveIdx];

  if (hasPrev) {
    const prev = points[prevIdx];
    if (isAxisAligned(prev, orig)) {
      // Edge prev→moved: keep the shared axis. Horizontal edge shares y.
      if (Math.abs(prev.y - orig.y) <= 1e-6) out[prevIdx].y = to.y;
      else out[prevIdx].x = to.x;
    }
  }
  if (hasNext) {
    const next = points[nextIdx];
    if (isAxisAligned(orig, next)) {
      if (Math.abs(orig.y - next.y) <= 1e-6) out[nextIdx].y = to.y;
      else out[nextIdx].x = to.x;
    }
  }
  return out;
}

/**
 * Snap a free point `p` to the nearest EXISTING vertex within `tolCm`, returning
 * that vertex (a copy) or `null` if none is close enough. `excludeIdx` skips a
 * vertex (e.g. the one being dragged) so it can't snap to itself. Used while
 * drawing to let a new point land exactly on a prior vertex, and while dragging
 * to snap onto a sibling — the CAD "object snap" that keeps walls meeting cleanly.
 */
export function snapToVertices(
  points: Pt[],
  p: Pt,
  tolCm: number,
  excludeIdx = -1,
): Pt | null {
  let best: Pt | null = null;
  let bestD2 = tolCm * tolCm;
  for (let i = 0; i < points.length; i++) {
    if (i === excludeIdx) continue;
    const d2 = dist2(p, points[i]);
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = { x: points[i].x, y: points[i].y };
    }
  }
  return best;
}

/** Do open segments p1→p2 and p3→p4 properly cross (excluding shared endpoints)? */
export function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const o = (a: Pt, b: Pt, c: Pt) =>
    Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  const d1 = o(p3, p4, p1);
  const d2 = o(p3, p4, p2);
  const d3 = o(p1, p2, p3);
  const d4 = o(p1, p2, p4);
  // Proper crossing: the two points of each segment straddle the other.
  if (d1 !== d2 && d3 !== d4 && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0) {
    return true;
  }
  return false;
}

/**
 * Would the polygon self-intersect if vertex `moveIdx` were placed at `to`?
 * Tests the two edges incident to `moveIdx` against all non-adjacent edges.
 * Used to veto vertex drags/nudges that would fold the outline over itself.
 */
export function wouldSelfIntersect(
  points: Pt[],
  moveIdx: number,
  to: Pt,
  closed: boolean,
): boolean {
  const n = points.length;
  if (n < 4) return false;
  const pts = points.map((p, i) => (i === moveIdx ? to : p));
  const last = closed ? n : n - 1;
  // The (up to) two edges that touch the moved vertex.
  const incident: Array<[number, number]> = [];
  const prev = (moveIdx - 1 + n) % n;
  if (closed || moveIdx > 0) incident.push([prev, moveIdx]);
  if (closed || moveIdx < n - 1) incident.push([moveIdx, (moveIdx + 1) % n]);
  for (const [ai, bi] of incident) {
    for (let i = 0; i < last; i++) {
      const ci = i;
      const di = (i + 1) % n;
      // Skip edges that share a vertex with the incident edge (adjacency).
      if (ci === ai || ci === bi || di === ai || di === bi) continue;
      if (segmentsIntersect(pts[ai], pts[bi], pts[ci], pts[di])) return true;
    }
  }
  return false;
}

/**
 * Does the polyline/polygon cross itself anywhere? Tests every pair of
 * non-adjacent edges for a proper crossing. `closed` includes the last→first
 * edge. Used to (a) reject a draw step that would cross the path so far and
 * (b) validate a candidate close. O(n²) — fine for hand-drawn outlines.
 */
export function polylineSelfIntersects(points: Pt[], closed: boolean): boolean {
  const n = points.length;
  if (n < 4) return false;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];
    for (let j = i + 1; j < last; j++) {
      // Adjacent edges share a vertex; the closing edge (closed) is adjacent to
      // edge 0 too. Skip all such shared-endpoint pairs.
      if (j === i) continue;
      if (j === i + 1) continue; // shares points[i+1]
      if (closed && i === 0 && j === last - 1) continue; // wrap-adjacent
      const b1 = points[j];
      const b2 = points[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

/**
 * Does the outline have any edge shorter than `minLenCm`? `closed` includes the
 * last→first edge. Used to validate a whole candidate point-set after a move that
 * shifts MORE than one vertex (e.g. `orthoVertexMove`), where the single-vertex
 * `wouldCollapseEdge` guard isn't enough.
 */
export function hasDegenerateEdge(
  points: Pt[],
  closed: boolean,
  minLenCm: number = MIN_EDGE_CM,
): boolean {
  const n = points.length;
  if (n < 2) return false;
  const last = closed ? n : n - 1;
  const min2 = minLenCm * minLenCm;
  for (let i = 0; i < last; i++) {
    if (dist2(points[i], points[(i + 1) % n]) < min2) return true;
  }
  return false;
}

/**
 * Is `candidate` a valid edit of the outline? Rejects a candidate that (a) has a
 * degenerate/hairline edge or (b) self-intersects. This is the catch-all guard
 * for moves that displace several vertices at once (rectilinear vertex drag),
 * which the per-vertex `wouldCollapseEdge` / `wouldSelfIntersect` don't fully
 * cover. Pure — the editor applies the candidate only when this returns true.
 */
export function isValidOutline(
  candidate: Pt[],
  closed: boolean,
  minLenCm: number = MIN_EDGE_CM,
): boolean {
  if (hasDegenerateEdge(candidate, closed, minLenCm)) return false;
  if (polylineSelfIntersects(candidate, closed)) return false;
  return true;
}

/**
 * While drawing an OPEN polyline, would appending `cand` after the current last
 * point create a self-crossing? Checks the new segment (last→cand) against every
 * earlier non-adjacent edge. Lets the editor refuse a draw click that would fold
 * the path over itself before it ever becomes a vertex.
 */
export function drawStepWouldCross(points: Pt[], cand: Pt): boolean {
  const n = points.length;
  if (n < 2) return false; // need at least two prior edges to cross a new one
  const a1 = points[n - 1];
  const a2 = cand;
  // Compare against edges 0..n-2 (the edge ending at the last point is adjacent).
  for (let i = 0; i < n - 2; i++) {
    if (segmentsIntersect(a1, a2, points[i], points[i + 1])) return true;
  }
  return false;
}

/**
 * Is closing the open polyline `points` (appending the first→last edge) a valid,
 * non-self-intersecting loop? Requires ≥3 points, a non-degenerate closing edge,
 * and no crossing of the resulting closed polygon.
 */
export function canClose(points: Pt[], minLenCm: number = MIN_EDGE_CM): boolean {
  const n = points.length;
  if (n < 3) return false;
  // Closing edge last→first must not be degenerate.
  if (dist2(points[n - 1], points[0]) < minLenCm * minLenCm) return false;
  return !polylineSelfIntersects(points, true);
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
// service dependency; values match calculation-engine.ts.
export const PITCH_CM = 58; // PITCH 0.58 m (beam centre-to-centre)
export const BEAM_WIDTH_CM = 12; // BEAM_WIDTH 0.12 m (beam thickness along the perp/length axis)
export const BLOCK_LENGTH_CM = 20; // BLOCK_LENGTH 0.20 m (block length along the beam/run axis)
export const BLOCK_VISIBLE_CM = 45; // BLOCK_VISIBLE 0.45 m (visible block width between two beams)
export const BEARING_CM = 15; // DEFAULT_BEARING 0.15 m (each end's seat on the wall; beam_length = clear span + 2×bearing)

/** The three engine layout patterns, mirrored here so the overlay can place
 *  beams + block rows in the SAME interleaving the engine bills:
 *   - "GB"  Г-Б   : N beams, N block rows — beam, block, beam, block … ends on a block.
 *   - "BGB" Б-Г-Б : N+1 beams, N block rows — closing beam, starts AND ends on a beam.
 *   - "GBG" Г-Б-Г : N beams, N+1 block rows — leading block row (half on the wall),
 *                   then beam, block, … ends on a block row. */
export type CadPattern = "GB" | "BGB" | "GBG";

/**
 * Whether a scheduled beam is part of the pattern's structural grid or a manual
 * extra (reinforcing / edge beam billed per-meter). Lets the cut-list show the
 * factory "8 main + 2 extra" instead of an undifferentiated "10".
 */
export type BeamKind = "structural" | "extra";

/** One row of a beam schedule: `count` beams that are all `lengthCm` long. */
export interface BeamScheduleEntry {
  /** Beam length in CM (= engine beam_length × 100, rounded). */
  lengthCm: number;
  /** How many beams of this exact length. */
  count: number;
  /**
   * Structural vs manual-extra split for this length+kind row. Optional so
   * legacy callers that built `{lengthCm, count}` by hand still type-check;
   * `beamLayout` always populates it. `mergeBeamSchedule` groups by
   * (lengthCm, kind) when present, falling back to length-only for bare rows.
   */
  kind?: BeamKind;
}

/**
 * Number of STRUCTURAL (pattern-produced) beams given the pattern and the
 * engine's `block_rows`. The engine's `beam_count` ALSO folds in manual extra
 * beams; subtracting this from `beam_count` recovers how many extras to draw
 * past the pitched run.
 *   GB  : beams == rows           → structural = rows
 *   BGB : beams == rows + 1       → structural = rows + 1
 *   GBG : beams == rows − 1       → structural = rows − 1
 */
export function structuralBeamCount(pattern: CadPattern, blockRows: number): number {
  if (pattern === "BGB") return blockRows + 1;
  if (pattern === "GBG") return Math.max(0, blockRows - 1);
  return blockRows; // GB
}

/** Perp-axis (beam-spacing axis) geometry for one bay's pattern, in CM.
 *  `beamCentres[i]` is the centre offset of structural beam i from the start
 *  wall; `rowSpans[r]` is the {start, thick} of block row r. Pure + testable. */
export interface PatternSpans {
  beamCentres: number[];
  rowSpans: Array<{ start: number; thick: number }>;
}

/**
 * Un-clamped perp-axis depth (cm) a pattern's STRUCTURAL beams + block rows +
 * the appended manual extras need at the true PITCH grid, before any bay
 * clamping. Used to decide whether the engine's pitch count physically fits the
 * drawn bay (`pitchOverflow`). Mirrors `patternSpans` + the extra-beam march:
 *   - structural depth = last block row's far edge (from `patternSpans`)
 *   - + `extra` beams, each BEAM_WIDTH_CM, appended past the structural run.
 * Returns 0 for a degenerate (no-beam) layout.
 */
export function requiredPerpDepth(
  pattern: CadPattern,
  structural: number,
  blockRows: number,
  beamThick: number,
  extra = 0,
): number {
  const spans = patternSpans(pattern, structural, blockRows, beamThick);
  const lastRow = spans.rowSpans.length
    ? spans.rowSpans[spans.rowSpans.length - 1]
    : null;
  const structuralDepth = lastRow ? lastRow.start + lastRow.thick : 0;
  // Extras are marched on past the structural run, each one beamThick deep.
  const extraDepth = Math.max(0, extra) * beamThick;
  return structuralDepth + extraDepth;
}

/**
 * Lay out one bay's STRUCTURAL beams + block rows along the perp axis for the
 * given pattern. `beamThick` is the drawn beam width (cm). The pitch grid is
 * PITCH_CM centre-to-centre. GBG leads with a block row sitting half on the
 * wall (BLOCK_VISIBLE_CM tall, but only the inner half is "between beams"); to
 * keep the picture clean we draw the full leading row up to the first beam.
 *
 * Beam centres:
 *   GB / BGB : beam i centre = beamThick/2 + i·PITCH   (i = 0 … structural−1)
 *   GBG      : the slab opens with a block row, so beam 0 is pushed in by one
 *              BLOCK_VISIBLE_CM gap: beam i centre = BLOCK_VISIBLE_CM +
 *              beamThick/2 + i·PITCH.
 *
 * Block rows fill the gaps:
 *   GB  : row r between beam r and r+1               (r = 0 … rows−1, last row
 *         runs from the last beam out to the slab end)
 *   BGB : row r strictly between beam r and beam r+1 (every row is bounded by
 *         beams on both sides)
 *   GBG : row 0 is the leading wall row (0 → beam0 top); rows 1…N each sit
 *         between consecutive beams.
 */
export function patternSpans(
  pattern: CadPattern,
  structural: number,
  blockRows: number,
  beamThick: number,
): PatternSpans {
  const beamCentres: number[] = [];
  const rowSpans: Array<{ start: number; thick: number }> = [];
  const lead = pattern === "GBG" ? BLOCK_VISIBLE_CM : 0;
  for (let i = 0; i < structural; i++) {
    beamCentres.push(lead + beamThick / 2 + i * PITCH_CM);
  }
  const gap = PITCH_CM - beamThick; // block-row thickness between two beam strips
  if (pattern === "GBG") {
    // Leading wall row: from the wall up to the first beam's top edge.
    const firstTop = beamCentres.length ? beamCentres[0] - beamThick / 2 : lead;
    if (firstTop > 0) rowSpans.push({ start: 0, thick: firstTop });
    // Remaining rows between consecutive beams.
    for (let r = 0; r < structural; r++) {
      const start = beamCentres[r] + beamThick / 2;
      rowSpans.push({ start, thick: gap });
    }
  } else {
    // GB / BGB: each row r begins after beam r's strip.
    for (let r = 0; r < blockRows; r++) {
      const start = beamCentres[r] + beamThick / 2;
      rowSpans.push({ start, thick: gap });
    }
  }
  return { beamCentres, rowSpans };
}

/**
 * A per-bay arrow showing which way the beams RUN, as two cm-space points
 * (tail → head) plus the unit direction. Drawn down the middle of the bay,
 * along the run axis, so the viewer can see the beam orientation at a glance.
 */
export interface BeamArrow {
  tail: Pt;
  head: Pt;
  /** Unit vector tail→head (run axis). */
  dir: Pt;
}

/** Upper bound on block CELLS a single bay may emit, to keep the SVG node count
 *  sane on large rooms. Past this the block grid is omitted (beams + arrow still
 *  draw); the schedule/material counts are unaffected — they come from the
 *  engine, not the rendered cells. */
export const MAX_BLOCK_CELLS_PER_BAY = 600;

/** Project-wide budget on rendered block cells across ALL bays, so a room that
 *  decomposes into many bays can't blow the node count even if each bay is under
 *  the per-bay cap. The renderer asks `blockCellBudget` which bays may draw their
 *  grid; the rest fall back to beams + arrow only (counts unaffected). */
export const MAX_BLOCK_CELLS_TOTAL = 1800;

/**
 * Decide, given each bay's would-be rendered cell count, which bays may actually
 * draw their block grid so the SUM stays within `budget`. Greedy by ascending
 * cell count — cheap, dense bays draw first; a single huge bay that would eat the
 * whole budget is dropped in favour of several small ones, which reads better.
 * Returns a boolean per bay (index-aligned). A bay already capped at the per-bay
 * level (cellCount 0) is reported `false` (nothing to draw). Pure + testable.
 */
export function blockCellBudget(
  cellCounts: number[],
  budget: number = MAX_BLOCK_CELLS_TOTAL,
): boolean[] {
  const allow = new Array<boolean>(cellCounts.length).fill(false);
  // Sort bay indices by ascending non-zero cell count.
  const order = cellCounts
    .map((c, i) => ({ c, i }))
    .filter((e) => e.c > 0)
    .sort((a, b) => a.c - b.c);
  let used = 0;
  for (const { c, i } of order) {
    if (used + c > budget) break;
    used += c;
    allow[i] = true;
  }
  return allow;
}

/**
 * The multi-line text content of a bay's on-drawing label, as an ordered list of
 * {role, text} lines so the renderer can size/colour each line consistently and
 * the legend can reuse the same strings. Pure so the label always agrees with the
 * engine-driven `BayLayout` (no ad-hoc formatting in the component):
 *  - line 0 "primary":  beam count (+extras) · beam length          e.g. "8 beams · 3.5 m"
 *  - line 1 "secondary": pattern + block tally                       e.g. "GB · 128 blocks"
 *  - line 2 "warn" (only when present): "⚠ not to scale" when the
 *    engine's pitch count didn't fit the bay, or "grid hidden" when
 *    the block grid was capped/over budget.
 * `index` is the 0-based bay number (label shows index+1).
 */
export interface BayLabelLine {
  role: "primary" | "secondary" | "warn";
  text: string;
}

export function bayLabelLines(
  layout: Pick<
    BayLayout,
    | "beamCount"
    | "extraBeams"
    | "beamLengthCm"
    | "pattern"
    | "totalBlocks"
    | "blockCellsCapped"
    | "pitchOverflow"
    | "beamDir"
  >,
  gridShown = true,
): BayLabelLine[] {
  const lines: BayLabelLine[] = [];
  const extraTxt = layout.extraBeams > 0 ? ` (+${layout.extraBeams})` : "";
  const lenTxt = layout.beamLengthCm > 0 ? ` · ${formatLengthCm(layout.beamLengthCm)}` : "";
  lines.push({
    role: "primary",
    text: `${layout.beamCount} beam${layout.beamCount === 1 ? "" : "s"}${extraTxt}${lenTxt}`,
  });
  lines.push({
    role: "secondary",
    text: `${layout.pattern} · ${layout.totalBlocks} block${layout.totalBlocks === 1 ? "" : "s"}`,
  });
  if (layout.pitchOverflow) {
    lines.push({ role: "warn", text: "⚠ not to scale" });
  } else if (layout.blockCellsCapped || !gridShown) {
    lines.push({ role: "warn", text: "grid hidden" });
  }
  return lines;
}

/**
 * A metric dimension span for a bay's PITCHED RUN DEPTH, in cm-space points: from
 * the start wall to the far edge of the structural run (`pitchExtentCm`) along the
 * bay's PERP axis, offset to one side of the bay so it doesn't sit on the beams.
 * This ties the drawing back to the engine's pitch count — the reader can verify
 * "8 pitches · 4.64 m of slab" lands where the strips actually end. Returns null
 * when the bay has no pitched run (degenerate / zero extent).
 *
 *  - For an "H" bay beams are spaced along y; the depth dimension runs vertically
 *    (a→b in +y) parked just inside the LEFT wall (x = rect.x + inset).
 *  - For a "V" bay beams are spaced along x; the depth runs horizontally parked
 *    just inside the TOP wall (y = rect.y + inset).
 * `outward` is the side the dimension text/ticks face (away from the bay centre).
 */
export interface PerpDimension {
  a: Pt;
  b: Pt;
  /** Length in cm of the span (== pitchExtentCm). */
  lengthCm: number;
  /** Unit vector a→b (the perp/spacing axis). */
  along: Pt;
  /** Unit vector the ticks/label face (toward the near wall, outside the run). */
  outward: Pt;
}

export function perpDimension(
  bay: Bay,
  pitchExtentCm: number,
  insetCm = 0,
): PerpDimension | null {
  if (!Number.isFinite(pitchExtentCm) || pitchExtentCm <= 1e-6) return null;
  const { x, y, w, h } = bay.rect;
  if (bay.beamDir === "H") {
    // Spaced along y → vertical depth dimension at the left wall.
    const px = x + Math.max(0, Math.min(insetCm, w));
    const extent = Math.min(pitchExtentCm, h);
    return {
      a: { x: px, y },
      b: { x: px, y: y + extent },
      lengthCm: extent,
      along: { x: 0, y: 1 },
      outward: { x: -1, y: 0 },
    };
  }
  // V bay: spaced along x → horizontal depth dimension at the top wall.
  const py = y + Math.max(0, Math.min(insetCm, h));
  const extent = Math.min(pitchExtentCm, w);
  return {
    a: { x, y: py },
    b: { x: x + extent, y: py },
    lengthCm: extent,
    along: { x: 1, y: 0 },
    outward: { x: 0, y: -1 },
  };
}

/** Everything needed to BOTH draw a bay and tabulate its materials. */
export interface BayLayout {
  /** Beam strips (cm rects) — exactly `beamCount` of them, inside the bay run.
   *  Structural strips come first (in pitch order), then the manual extras, so
   *  `beamKinds` is index-aligned with this array. */
  beams: Rect[];
  /** Per-beam structural/extra kind, index-aligned with `beams`. Lets the
   *  renderer style manual extras distinctly (e.g. hatched) from the structural
   *  pitch grid without re-deriving the split. */
  beamKinds: BeamKind[];
  /** Bearing seats: two small rects per beam (one at each run end) marking the
   *  `bearingCm` the beam rests on the wall. Empty when bearing is 0/omitted.
   *  These overlay the strip ends so the beam_length (clear span + 2×bearing)
   *  reads correctly even though the strip itself is clamped to the clear bay. */
  bearings: Rect[];
  /** Block cells (cm rects). Empty when the true grid would exceed
   *  `MAX_BLOCK_CELLS_PER_BAY` (see `blockCellsCapped`). */
  blockCells: Rect[];
  /** Per-block-cell kind, index-aligned with `blockCells`: "cut" marks a partial
   *  (make-up) module shorter than BLOCK_LENGTH_CM at the far end of a row, so the
   *  renderer can flag cut filler pieces distinctly. */
  blockKinds: ("full" | "cut")[];
  /** True when `blockCells` was suppressed because the full grid was too dense
   *  to draw; `totalBlocks` still reports the real material count. */
  blockCellsCapped: boolean;
  /** Beam schedule for THIS bay (grouped by length; here a single length). */
  schedule: BeamScheduleEntry[];
  /** Total blocks in this bay = blockRows × blocksPerRow. */
  totalBlocks: number;
  /** Beam-run direction arrow down the centre of the bay (cm space). */
  arrow: BeamArrow;
  /** Beam direction of the bay (echoed for the renderer's legend). */
  beamDir: BeamDir;
  /** Beam count for this bay (= the engine's beam_count). */
  beamCount: number;
  /** Beam length in cm for this bay (one length per bay). */
  beamLengthCm: number;
  /** The pattern this layout was drawn for (echoed for the legend). */
  pattern: CadPattern;
  /** Structural (pattern-produced) beams of `beamCount` — on the pitch grid. */
  structuralBeams: number;
  /** Manual extra beams of `beamCount` — drawn past the pitched run. */
  extraBeams: number;
  /** Perp-axis (pitch-spacing) extent the structural run actually occupies, in
   *  cm, from the first beam's start edge to the last block row's far edge.
   *  This is the slab depth the picture draws; useful for a perp dimension. */
  pitchExtentCm: number;
  /** Block module length actually drawn along the run axis (cm) — true
   *  BLOCK_LENGTH_CM where the run divides evenly, else the averaged cell. */
  blockModuleCm: number;
  /** Perp-axis depth the pattern's beams+rows WOULD need at the true PITCH grid
   *  (un-clamped), in cm. When this exceeds the bay's perp span the picture had
   *  to compress/clamp beams to fit — `pitchOverflow` flags that so the UI can
   *  warn the drawing no longer reads at true scale (counts stay correct). */
  requiredPerpCm: number;
  /** True when `requiredPerpCm` > the bay's perp span: the engine's pitch count
   *  doesn't physically fit the drawn bay, so beams were clamped (and may visually
   *  merge at the far wall). Material counts are unaffected — they're the engine's. */
  pitchOverflow: boolean;
}

/**
 * A fixed palette of visually-distinct {beam, block, label} colour triples, one
 * per bay (cycled). Beam is the saturated fill, block is a pale tint of the same
 * hue for the in-fill grid, and label is a dark readable variant for text. Pure
 * data so both the canvas overlay and the legend stay in lock-step.
 */
export interface BayPalette {
  beam: string;
  block: string;
  label: string;
}

export const BAY_PALETTE: readonly BayPalette[] = [
  { beam: "#2563eb", block: "#dbeafe", label: "#1e40af" }, // blue
  { beam: "#059669", block: "#d1fae5", label: "#065f46" }, // emerald
  { beam: "#d97706", block: "#fef3c7", label: "#92400e" }, // amber
  { beam: "#dc2626", block: "#fee2e2", label: "#991b1b" }, // red
  { beam: "#7c3aed", block: "#ede9fe", label: "#5b21b6" }, // violet
  { beam: "#db2777", block: "#fce7f3", label: "#9d174d" }, // pink
  { beam: "#0d9488", block: "#ccfbf1", label: "#115e59" }, // teal
  { beam: "#ea580c", block: "#ffedd5", label: "#9a3412" }, // orange
] as const;

/** The palette entry for bay `i` (cycles through `BAY_PALETTE`). */
export function bayPalette(i: number): BayPalette {
  return BAY_PALETTE[((i % BAY_PALETTE.length) + BAY_PALETTE.length) % BAY_PALETTE.length];
}

/**
 * Build the geometric beam/block overlay for a bay, in CM, positioned inside
 * `bay.rect`. The picture is driven by the ENGINE's counts AND its `pattern`,
 * so the drawing matches the numbers AND the real beam↔block interleaving.
 *
 * PATTERN-ACCURATE positioning (`patternSpans`):
 *  - STRUCTURAL beams (those the pattern produces) sit on the engine's real
 *    PITCH grid (58 cm centre-to-centre). For GB / BGB the first beam centre is
 *    half a beam-width off the wall; for GBG the slab OPENS with a block row, so
 *    the first beam is pushed in by one BLOCK_VISIBLE (45 cm) gap and the
 *    leading wall row is drawn before it. This is what makes Г-Б-Г read as a
 *    block-first slab instead of a beam-first one.
 *  - MANUAL extra beams (beamCount − structural) are appended just past the
 *    pitched run, each one BEAM_WIDTH_CM on, so they read as add-on line items
 *    distinct from the structural grid.
 *  - Each beam STRIP is `beamLengthCm` long along the run axis (= the engine's
 *    beam_length, inner_width + 2×bearing) and is centred on the run span so the
 *    bearing overhang is visible; falls back to the full run when omitted.
 *  - Block rows fill the pattern's gaps; each row is split into exactly
 *    `blocksPerRow` cells along the run axis (matching the engine), and only the
 *    portion of a row INSIDE the bay is rendered (the GBG leading wall row may
 *    be partly off the perp extent).
 *
 * Returns `beamCount` beams and (up to) `blockRows × blocksPerRow` block cells;
 * all rects are clamped to lie within `bay.rect`. `totalBlocks` is always the
 * true material count (`blockRows × blocksPerRow`), independent of clamping/caps.
 */
export function beamLayout(
  bay: Bay,
  beamCount: number,
  blockRows: number,
  blocksPerRow = 0,
  beamLengthCm = 0,
  pattern: CadPattern = "GB",
  bearingCm = 0,
): BayLayout {
  const { x, y, w, h } = bay.rect;
  const horizontal = bay.beamDir === "H";
  const beams: Rect[] = [];
  const beamKinds: BeamKind[] = [];
  const bearings: Rect[] = [];
  const blockCells: Rect[] = [];
  const blockKinds: ("full" | "cut")[] = [];
  // A degenerate arrow (zero-length) so the field is always present.
  const cx = x + w / 2;
  const cy = y + h / 2;
  const flatArrow: BeamArrow = {
    tail: { x: cx, y: cy },
    head: { x: cx, y: cy },
    dir: { x: 0, y: 0 },
  };
  const lenCmFallback = (s: number) => (beamLengthCm > 0 ? Math.round(beamLengthCm) : Math.round(s));
  const empty: BayLayout = {
    beams,
    beamKinds,
    bearings,
    blockCells,
    blockKinds,
    blockCellsCapped: false,
    schedule: [],
    totalBlocks: 0,
    arrow: flatArrow,
    beamDir: bay.beamDir,
    beamCount: 0,
    beamLengthCm: 0,
    pattern,
    structuralBeams: 0,
    extraBeams: 0,
    pitchExtentCm: 0,
    blockModuleCm: 0,
    requiredPerpCm: 0,
    pitchOverflow: false,
  };
  if (beamCount <= 0 || w <= 0 || h <= 0) return empty;

  // "perp" is the axis the beams are spaced along; "run" is the axis they span.
  // H → beams run along x (span = w), spaced along y (perp = h).
  // V → beams run along y (span = h), spaced along x (perp = w).
  const runSpan = horizontal ? w : h;
  const perpSpan = horizontal ? h : w;

  const beamThick = Math.min(BEAM_WIDTH_CM, perpSpan);
  // Beam strip length along the run axis: the real beam_length (with bearings),
  // clamped to the bay; falls back to the full run when not supplied.
  const stripLen = beamLengthCm > 0 ? Math.min(beamLengthCm, runSpan) : runSpan;
  const runOffBeam = (runSpan - stripLen) / 2; // centre the strip on the run span

  // Split beamCount into structural (pattern-produced, on the pitch grid) and
  // manual extras (drawn past the run). structuralBeamCount() derives the
  // structural total from the pattern + block_rows; extras are the remainder.
  const structural = Math.min(beamCount, structuralBeamCount(pattern, blockRows));
  const extraBeams = beamCount - structural;

  // Pattern-faithful perp-axis spans for the structural beams + block rows.
  const spans = patternSpans(pattern, structural, blockRows, beamThick);

  // The drawn bearing seat per end: the wall-rest portion of the beam, capped so
  // the two seats never exceed the strip. 0 when no bearing supplied/possible.
  const bearingDraw = Math.max(0, Math.min(bearingCm, (stripLen - 1) / 2));

  // Helper: emit one beam strip (and its two bearing seats) given the perp
  // offset (top/left of the strip).
  const pushBeam = (perpOff: number, kind: BeamKind) => {
    const off = Math.max(0, Math.min(perpOff, perpSpan - beamThick));
    beams.push(
      horizontal
        ? { x: x + runOffBeam, y: y + off, w: stripLen, h: beamThick }
        : { x: x + off, y: y + runOffBeam, w: beamThick, h: stripLen },
    );
    beamKinds.push(kind);
    if (bearingDraw > 0) {
      const near = runOffBeam; // start-of-run seat
      const far = runOffBeam + stripLen - bearingDraw; // end-of-run seat
      if (horizontal) {
        bearings.push({ x: x + near, y: y + off, w: bearingDraw, h: beamThick });
        bearings.push({ x: x + far, y: y + off, w: bearingDraw, h: beamThick });
      } else {
        bearings.push({ x: x + off, y: y + near, w: beamThick, h: bearingDraw });
        bearings.push({ x: x + off, y: y + far, w: beamThick, h: bearingDraw });
      }
    }
  };

  // Structural beams on the pattern grid.
  for (const c of spans.beamCentres) pushBeam(c - beamThick / 2, "structural");
  // Manual extras: marched past the WHOLE structural run (the far edge of the
  // last block row), not merely past the last beam — otherwise the first extra
  // would overlap the trailing structural block row. Each extra is one beamThick
  // deep, so the strip count equals the engine's beam_count exactly and they read
  // as a distinct add-on band after the pitched grid.
  const lastRowSpan = spans.rowSpans.length
    ? spans.rowSpans[spans.rowSpans.length - 1]
    : null;
  const structuralFar = lastRowSpan
    ? lastRowSpan.start + lastRowSpan.thick
    : spans.beamCentres.length > 0
      ? spans.beamCentres[spans.beamCentres.length - 1] + beamThick / 2
      : 0;
  for (let e = 0; e < extraBeams; e++) pushBeam(structuralFar + e * beamThick, "extra");

  // Block-cell grid: `cols` cells per row along the run axis. cols = the
  // engine's blocks_per_row when given (so the picture matches), else derived.
  const cols =
    blocksPerRow > 0 ? blocksPerRow : Math.max(1, Math.ceil(stripLen / BLOCK_LENGTH_CM));
  // True-module cells: draw the interior cells at the real BLOCK_LENGTH_CM where
  // it fits within the run, and let the LAST cell absorb the remainder, so the
  // grid reads as physical 20-cm modules instead of a stretched fill. When the
  // run is too short for `cols` true modules, fall back to an even split.
  const trueModules = BLOCK_LENGTH_CM * cols <= stripLen + 1e-6;
  const cellRun = stripLen / cols; // even-split fallback / reported average
  const blockModuleCm = trueModules ? BLOCK_LENGTH_CM : cellRun;
  // totalBlocks is the proven material figure: rows × cols, regardless of how
  // many cells we actually render (clamping / cap only affect the drawing).
  const totalBlocks = blockRows * cols;
  // Bound the rendered node count: skip emitting the per-cell grid (but keep the
  // material total) when the full grid would be too dense to draw cheaply.
  const blockCellsCapped = totalBlocks > MAX_BLOCK_CELLS_PER_BAY;
  if (!blockCellsCapped) {
    // Per-column run offset + width: equal true modules, last one absorbs the
    // leftover so the cells always tile the full strip with no gap/overrun.
    const colRun = (c: number) =>
      trueModules ? c * BLOCK_LENGTH_CM : c * cellRun;
    const colW = (c: number) => {
      if (!trueModules) return cellRun;
      return c === cols - 1 ? stripLen - BLOCK_LENGTH_CM * (cols - 1) : BLOCK_LENGTH_CM;
    };
    // The last column is a CUT (make-up) piece when true-module tiling leaves a
    // remainder shorter than a full block at the far end of the row.
    const lastIsCut =
      trueModules && cols > 0 && stripLen - BLOCK_LENGTH_CM * (cols - 1) < BLOCK_LENGTH_CM - 1e-6;
    for (const span of spans.rowSpans) {
      // Clamp the row to the perp extent (e.g. a GBG leading wall row).
      let perpOff = span.start;
      let rowThick = span.thick;
      if (perpOff < 0) {
        rowThick += perpOff;
        perpOff = 0;
      }
      if (perpOff + rowThick > perpSpan) rowThick = perpSpan - perpOff;
      if (rowThick <= 0) continue;
      for (let c = 0; c < cols; c++) {
        const runOff = runOffBeam + colRun(c);
        const cw = colW(c);
        blockCells.push(
          horizontal
            ? { x: x + runOff, y: y + perpOff, w: cw, h: rowThick }
            : { x: x + perpOff, y: y + runOff, w: rowThick, h: cw },
        );
        blockKinds.push(c === cols - 1 && lastIsCut ? "cut" : "full");
      }
    }
  }

  // Beam-run direction arrow: a single shaft down the middle of the bay (along
  // the run axis), inset from each end so the head/tail sit inside the strips.
  const perpMid = perpSpan / 2;
  const arrowInset = Math.min(stripLen * 0.18, 40); // cm
  const a0 = runOffBeam + arrowInset;
  const a1 = runOffBeam + stripLen - arrowInset;
  const arrow: BeamArrow =
    a1 > a0
      ? horizontal
        ? {
            tail: { x: x + a0, y: y + perpMid },
            head: { x: x + a1, y: y + perpMid },
            dir: { x: 1, y: 0 },
          }
        : {
            tail: { x: x + perpMid, y: y + a0 },
            head: { x: x + perpMid, y: y + a1 },
            dir: { x: 0, y: 1 },
          }
      : flatArrow;

  // Perp extent the pattern run actually fills: from the first structural beam's
  // start edge (or 0) to the far edge of the last block row PLUS the appended
  // extras, clamped to the bay.
  const structuralExtent = lastRowSpan ? lastRowSpan.start + lastRowSpan.thick : 0;
  const rawExtent = structuralExtent + extraBeams * beamThick;
  const pitchExtentCm = Math.min(perpSpan, Math.max(0, rawExtent));

  // Un-clamped depth the pattern needs at the true PITCH grid. When it exceeds
  // the bay's perp span the strips were clamped (and may visually merge at the
  // far wall) — surface that so the UI can warn the drawing isn't at true scale.
  const requiredPerpCm = requiredPerpDepth(pattern, structural, blockRows, beamThick, extraBeams);
  const pitchOverflow = requiredPerpCm > perpSpan + 1e-6;

  const lengthCm = lenCmFallback(runSpan);
  // Beam schedule for THIS bay, split by kind so the cut-list can show
  // structural vs manual-extra at the same length. Both are the engine's
  // beam_length; we only differentiate provenance. totalBeams() over this
  // schedule still equals beamCount.
  const schedule: BeamScheduleEntry[] = [];
  if (structural > 0) schedule.push({ lengthCm, count: structural, kind: "structural" });
  if (extraBeams > 0) schedule.push({ lengthCm, count: extraBeams, kind: "extra" });

  return {
    beams,
    beamKinds,
    bearings,
    blockCells,
    blockKinds,
    blockCellsCapped,
    schedule,
    totalBlocks,
    arrow,
    beamDir: bay.beamDir,
    beamCount,
    beamLengthCm: lengthCm,
    pattern,
    structuralBeams: structural,
    extraBeams,
    pitchExtentCm,
    blockModuleCm,
    requiredPerpCm,
    pitchOverflow,
  };
}

/**
 * Merge per-bay beam schedules into ONE project schedule: counts grouped by
 * beam length (cm), summed across every bay, sorted by length ascending — the
 * factory cut-list. The structural/extra `kind` is COLLAPSED here (the saw cuts
 * by length, not provenance); use `mergeBeamScheduleByKind` when the UI needs
 * the split. Output rows carry length+count only. Pure + order-independent.
 */
export function mergeBeamSchedule(
  schedules: BeamScheduleEntry[][],
): BeamScheduleEntry[] {
  const byLen = new Map<number, number>();
  for (const sched of schedules) {
    for (const { lengthCm, count } of sched) {
      if (count <= 0) continue;
      byLen.set(lengthCm, (byLen.get(lengthCm) ?? 0) + count);
    }
  }
  return Array.from(byLen.entries())
    .map(([lengthCm, count]) => ({ lengthCm, count }))
    .sort((a, b) => a.lengthCm - b.lengthCm);
}

/**
 * Like `mergeBeamSchedule` but PRESERVES the structural/extra split: groups by
 * (lengthCm, kind), summed across bays. Sorted by length ascending, then
 * structural before extra at the same length. Rows missing `kind` default to
 * "structural" so a legacy bare schedule still merges sensibly. This is the
 * cut-list the UI shows when it wants "8 main + 2 extra @ 3.5 m".
 */
export function mergeBeamScheduleByKind(
  schedules: BeamScheduleEntry[][],
): Required<BeamScheduleEntry>[] {
  const key = (lengthCm: number, kind: BeamKind) => `${lengthCm}|${kind}`;
  const acc = new Map<string, { lengthCm: number; kind: BeamKind; count: number }>();
  for (const sched of schedules) {
    for (const { lengthCm, count, kind } of sched) {
      if (count <= 0) continue;
      const k = kind ?? "structural";
      const id = key(lengthCm, k);
      const cur = acc.get(id);
      if (cur) cur.count += count;
      else acc.set(id, { lengthCm, kind: k, count });
    }
  }
  const kindRank = (k: BeamKind) => (k === "structural" ? 0 : 1);
  return Array.from(acc.values()).sort(
    (a, b) => a.lengthCm - b.lengthCm || kindRank(a.kind) - kindRank(b.kind),
  );
}

/** Total beam count across a project schedule (any kind). */
export function totalBeams(schedule: BeamScheduleEntry[]): number {
  return schedule.reduce((s, e) => s + e.count, 0);
}

/** Total beams of a given kind across a (kind-aware) schedule. */
export function totalBeamsOfKind(
  schedule: BeamScheduleEntry[],
  kind: BeamKind,
): number {
  return schedule.reduce((s, e) => s + ((e.kind ?? "structural") === kind ? e.count : 0), 0);
}

/** A resolved metric scale bar: a "nice" round length (cm) and its on-screen
 *  pixel width at the given cm→px scale, plus a label. */
export interface ScaleBar {
  lengthCm: number;
  px: number;
  label: string;
}

/**
 * Pick a "nice" 1/2/5×10ⁿ scale-bar length (cm) whose drawn width is ≤
 * `maxPx` at the given `pxPerCm`, and return it with its pixel width + label.
 * Used to draw a metric reference bar on the canvas so the drawing reads as
 * scaled, not just abstract. Pure: no DOM. Falls back to the smallest step
 * (1 cm) when even that overflows `maxPx`.
 */
export function scaleBar(pxPerCm: number, maxPx: number): ScaleBar {
  const mk = (lengthCm: number): ScaleBar => ({
    lengthCm,
    px: lengthCm * pxPerCm,
    label: formatLengthCm(lengthCm),
  });
  if (!Number.isFinite(pxPerCm) || pxPerCm <= 0 || maxPx <= 0) return mk(1);
  const maxCm = maxPx / pxPerCm;
  // Largest 1/2/5×10ⁿ ≤ maxCm.
  const steps = [1, 2, 5];
  let best = 1;
  for (let exp = -1; exp <= 5; exp++) {
    const base = Math.pow(10, exp);
    for (const s of steps) {
      const cand = s * base;
      if (cand <= maxCm + 1e-9) best = cand;
    }
  }
  return mk(best);
}

/** A view transform: a zoom multiplier and a screen-space pan (tx,ty), applied
 *  as `screen = world*zoom + (tx,ty)`. Mirrors the editor's `View`. */
export interface ViewTransform {
  zoom: number;
  tx: number;
  ty: number;
}

/**
 * Zoom-to-fit: compute the view transform that frames the world-space bounding
 * box `{x,y,w,h}` (already in BASE/world px, i.e. cm×baseScale + margin) inside a
 * `viewW × viewH` viewport with `padPx` breathing room, clamped to
 * `[minZoom, maxZoom]` and centred. Pure so the fit math is testable without a
 * DOM. Returns the identity view for an empty/degenerate box.
 */
export function fitView(
  worldBox: Rect,
  viewW: number,
  viewH: number,
  padPx: number,
  minZoom: number,
  maxZoom: number,
): ViewTransform {
  const { x, y, w, h } = worldBox;
  if (w <= 1e-6 || h <= 1e-6 || viewW <= 0 || viewH <= 0) {
    return { zoom: 1, tx: 0, ty: 0 };
  }
  const availW = Math.max(1, viewW - 2 * padPx);
  const availH = Math.max(1, viewH - 2 * padPx);
  let zoom = Math.min(availW / w, availH / h);
  zoom = Math.max(minZoom, Math.min(maxZoom, zoom));
  // Centre the box: screen-centre of the box should land at the viewport centre.
  const cx = x + w / 2;
  const cy = y + h / 2;
  return {
    zoom,
    tx: viewW / 2 - cx * zoom,
    ty: viewH / 2 - cy * zoom,
  };
}
