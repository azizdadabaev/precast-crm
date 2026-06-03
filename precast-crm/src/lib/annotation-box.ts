/**
 * Pure helpers for room-capture annotation boxes.
 *
 * A NormBox is normalized to the source image's natural size: every value
 * is in [0,1], so a box survives zoom, resize, and re-render and can be
 * stored verbatim on Calculation.annotationBox.
 */
export interface NormBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Near-zero-area threshold (fraction of the image) below which a box is junk. */
const EPS = 0.005;

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Clamp x/y into [0,1] and shrink w/h so the box never spills outside the
 * image. Coords are rounded to 4 dp so stored values stay tidy and free of
 * float noise.
 */
export function clampBox(box: NormBox): NormBox {
  const x = clamp01(box.x);
  const y = clamp01(box.y);
  const w = Math.min(Math.max(0, box.w), 1 - x);
  const h = Math.min(Math.max(0, box.h), 1 - y);
  return { x: round4(x), y: round4(y), w: round4(w), h: round4(h) };
}

/** True when the box is too small in either dimension to be a real room. */
export function isDegenerate(box: NormBox): boolean {
  return box.w < EPS || box.h < EPS;
}

/**
 * Build a normalized box from two pixel corners of a drag, relative to the
 * rendered image rect. Order-independent (drag in any direction), then
 * clamped inside the image.
 */
export function fromDrag(
  start: { x: number; y: number },
  end: { x: number; y: number },
  rect: { width: number; height: number },
): NormBox {
  const x0 = Math.min(start.x, end.x);
  const y0 = Math.min(start.y, end.y);
  const x1 = Math.max(start.x, end.x);
  const y1 = Math.max(start.y, end.y);
  return clampBox({
    x: x0 / rect.width,
    y: y0 / rect.height,
    w: (x1 - x0) / rect.width,
    h: (y1 - y0) / rect.height,
  });
}

/** Map a normalized box to pixel coords for a given rendered size. */
export function toPixels(box: NormBox, width: number, height: number) {
  return {
    x: box.x * width,
    y: box.y * height,
    w: box.w * width,
    h: box.h * height,
  };
}
