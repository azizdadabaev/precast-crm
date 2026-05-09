/**
 * Tiny SVG helpers used by the dashboard's gauge / arc renderings.
 * Both functions are pure and side-effect free.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * Convert a polar angle (degrees, measured from the +x axis going CCW)
 * to a Cartesian point on a circle. Uses the dashboard convention where
 * 0° points LEFT (i.e. the start of a half-circle gauge spanning 0..180°
 * going clockwise across the top).
 */
export function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
): Point {
  const rad = ((angleDeg - 180) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/**
 * Build an SVG arc path string from start to end angle. Used by the
 * "This week's capacity" half-gauge in the dashboard. Angles are
 * degrees in the polarToCartesian convention above (0° = left, 180°
 * = right, sweeping over the top).
 */
export function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}
