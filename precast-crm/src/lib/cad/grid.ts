// Infinite CAD grid: screen-space line segments recomputed from the live view so
// the grid always fills the whole viewport at any zoom/pan.
//
// Forward transform (world cm → screen px), y is DOWN:
//   screenX = (marginPx + Xcm * baseScale) * zoom + tx
//   screenY = (marginPx + Ycm * baseScale) * zoom + ty
// Inverse:
//   Xcm = ((screenX - tx) / zoom - marginPx) / baseScale

export interface GridLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface VisibleGrid {
  minor: GridLine[]; // screen-px line segments, step = stepCm
  major: GridLine[]; // screen-px, every majorEvery-th line (cm divisible by stepCm*majorEvery)
  axisX: number | null; // screen x of the world x=0 vertical axis, if visible; else null
  axisY: number | null; // screen y of the world y=0 horizontal axis, if visible; else null
}

const MAX_LINES = 1000;

export function visibleGridLines(params: {
  zoom: number;
  tx: number;
  ty: number;
  wPx: number;
  hPx: number;
  baseScale: number;
  marginPx: number;
  stepCm: number;
  majorEvery: number;
}): VisibleGrid {
  const { zoom, tx, ty, wPx, hPx, baseScale, marginPx, stepCm, majorEvery } = params;

  const minor: GridLine[] = [];
  const major: GridLine[] = [];

  // Degenerate inputs → empty grid, no axes.
  if (
    !(zoom > 0) ||
    !(baseScale > 0) ||
    !(stepCm > 0) ||
    !(majorEvery > 0) ||
    wPx <= 0 ||
    hPx <= 0
  ) {
    return { minor, major, axisX: null, axisY: null };
  }

  // world cm ↔ screen px for one axis (margin + offset are shared by x/y).
  const cmToScreen = (cm: number, t: number) => (marginPx + cm * baseScale) * zoom + t;
  const screenToCm = (s: number, t: number) => ((s - t) / zoom - marginPx) / baseScale;

  const majorStepCm = stepCm * majorEvery;
  const minorPx = stepCm * baseScale * zoom; // px between adjacent minor lines
  const majorPx = majorStepCm * baseScale * zoom; // px between adjacent major lines

  // Density cap: too dense → drop minors (and majors too if even those are dense).
  const drawMinor = minorPx >= 4;
  const drawMajor = majorPx >= 4;

  // Emits k*stepCm lines whose screen position falls in [0, extentPx], padded one
  // step each side. `build` makes the GridLine for a given screen coordinate.
  const emit = (
    t: number,
    extentPx: number,
    build: (screen: number) => GridLine,
  ) => {
    // world-cm range covering [0, extentPx], padded ±1 step.
    const cmA = screenToCm(0, t);
    const cmB = screenToCm(extentPx, t);
    const lo = Math.min(cmA, cmB) - stepCm;
    const hi = Math.max(cmA, cmB) + stepCm;
    const kLo = Math.ceil(lo / stepCm);
    const kHi = Math.floor(hi / stepCm);

    for (let k = kLo; k <= kHi; k++) {
      if (minor.length + major.length >= MAX_LINES) break;
      const cm = k * stepCm;
      const major_ = Math.round(cm) % majorStepCm === 0;
      const screen = cmToScreen(cm, t);
      if (major_) {
        if (drawMajor) major.push(build(screen));
      } else {
        if (drawMinor) minor.push(build(screen));
      }
    }
  };

  // Vertical lines at world X = k*stepCm, spanning full height.
  emit(tx, wPx, (screenX) => ({ x1: screenX, y1: 0, x2: screenX, y2: hPx }));
  // Horizontal lines at world Y = k*stepCm, spanning full width.
  emit(ty, hPx, (screenY) => ({ x1: 0, y1: screenY, x2: wPx, y2: screenY }));

  // Axes: screen position of world 0, if within the visible range (inclusive).
  const axisXpx = cmToScreen(0, tx);
  const axisYpx = cmToScreen(0, ty);
  const axisX = axisXpx >= 0 && axisXpx <= wPx ? axisXpx : null;
  const axisY = axisYpx >= 0 && axisYpx <= hPx ? axisYpx : null;

  return { minor, major, axisX, axisY };
}
