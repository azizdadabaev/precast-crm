import { describe, it, expect } from "vitest";
import { visibleGridLines, type GridLine, type VisibleGrid } from "@/lib/cad/grid";

// Shared base view: baseScale 0.6 px/cm, 24px margin, 680×680 viewport,
// 10cm minor step, every 5th line (50cm) major.
const base = {
  baseScale: 0.6,
  marginPx: 24,
  wPx: 680,
  hPx: 680,
  stepCm: 10,
  majorEvery: 5,
};

// Forward transform used to derive expectations (must mirror grid.ts).
const screenXof = (xcm: number, v: { zoom: number; tx: number }) =>
  (base.marginPx + xcm * base.baseScale) * v.zoom + v.tx;

const sortedXs = (lines: GridLine[]) =>
  Array.from(new Set(lines.filter((l) => l.y1 === 0).map((l) => l.x1))).sort((a, b) => a - b);

const allVertical = (g: VisibleGrid) => [...g.minor, ...g.major].filter((l) => l.x1 === l.x2);
const allHorizontal = (g: VisibleGrid) => [...g.minor, ...g.major].filter((l) => l.y1 === l.y2);

describe("cad grid — visibleGridLines (identity-ish view)", () => {
  const view = { zoom: 1, tx: 0, ty: 0 };
  const g = visibleGridLines({ ...base, ...view });

  it("maps the world axes to the margin offset", () => {
    expect(g.axisX).toBe(24); // (24 + 0*0.6)*1 + 0
    expect(g.axisY).toBe(24);
  });

  it("has a MAJOR vertical line at the x=0 axis (0 divisible by 50)", () => {
    // The axis screenX appears as a vertical major line, not a minor one.
    const majorVxs = g.major.filter((l) => l.x1 === l.x2).map((l) => l.x1);
    expect(majorVxs).toContain(24);
    const minorVxs = g.minor.filter((l) => l.x1 === l.x2).map((l) => l.x1);
    expect(minorVxs).not.toContain(24);
  });

  it("spaces vertical lines 6px apart (10cm * 0.6 * zoom1)", () => {
    const xs = sortedXs(allVertical(g));
    expect(xs.length).toBeGreaterThan(2);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i] - xs[i - 1]).toBeCloseTo(6, 6);
    }
  });

  it("every major vertical line maps to a cm divisible by 50", () => {
    for (const l of g.major.filter((x) => x.x1 === x.x2)) {
      // invert: xcm = ((screenX - tx)/zoom - margin)/baseScale
      const xcm = ((l.x1 - view.tx) / view.zoom - base.marginPx) / base.baseScale;
      expect(Math.abs(Math.round(xcm) % (base.stepCm * base.majorEvery))).toBe(0);
    }
    // Spot-check: 50cm → screenX 54, 100cm → 84 are both major verticals.
    const majorVxs = g.major.filter((l) => l.x1 === l.x2).map((l) => l.x1);
    expect(majorVxs).toContain(screenXof(50, view)); // 54
    expect(majorVxs).toContain(screenXof(100, view)); // 84
  });

  it("vertical lines span the full height, horizontal lines the full width", () => {
    for (const l of allVertical(g)) {
      expect(l.y1).toBe(0);
      expect(l.y2).toBe(base.hPx);
    }
    for (const l of allHorizontal(g)) {
      expect(l.x1).toBe(0);
      expect(l.x2).toBe(base.wPx);
    }
  });

  it("vertical x positions cover both viewport edges", () => {
    const xs = sortedXs(allVertical(g));
    expect(Math.min(...xs)).toBeLessThanOrEqual(0);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(base.wPx);
  });
});

describe("cad grid — panned view", () => {
  const view = { zoom: 1, tx: 100, ty: -50 };
  const g = visibleGridLines({ ...base, ...view });

  it("offsets the visible vertical axis by the pan", () => {
    expect(g.axisX).toBe(124); // (24 + 0)*1 + 100
  });

  it("returns null for the horizontal axis when y=0 is off-screen", () => {
    // screenY for Y=0 = (24+0)*1 + (-50) = -26 < 0 → not visible.
    expect(g.axisY).toBeNull();
  });

  it("still fills the viewport horizontally after panning", () => {
    const xs = sortedXs(allVertical(g));
    expect(Math.min(...xs)).toBeLessThanOrEqual(0);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(base.wPx);
  });
});

describe("cad grid — density safety cap", () => {
  it("drops minor but keeps major when minor step < 4px and major >= 4px", () => {
    // zoom 0.5: minor 10*0.6*0.5 = 3px (<4); major 50*0.6*0.5 = 15px (>=4).
    const g = visibleGridLines({ ...base, zoom: 0.5, tx: 0, ty: 0 });
    expect(g.minor).toHaveLength(0);
    expect(g.major.length).toBeGreaterThan(0);
    // Axis still computed: x=0 → (24)*0.5 + 0 = 12.
    expect(g.axisX).toBe(12);
  });

  it("drops both minor and major when even the major step < 4px (axes still computed)", () => {
    // zoom 0.1: minor 0.6px, major 3px — both < 4.
    const g = visibleGridLines({ ...base, zoom: 0.1, tx: 0, ty: 0 });
    expect(g.minor).toHaveLength(0);
    expect(g.major).toHaveLength(0);
    expect(g.axisX).toBeCloseTo(2.4, 6); // 24*0.1
    expect(g.axisY).toBeCloseTo(2.4, 6);
  });

  it("keeps the total line count bounded (< 1000) at small zoom", () => {
    const g = visibleGridLines({ ...base, zoom: 0.5, tx: 0, ty: 0 });
    expect(g.minor.length + g.major.length).toBeLessThan(1000);
    const g2 = visibleGridLines({ ...base, zoom: 0.1, tx: 0, ty: 0 });
    expect(g2.minor.length + g2.major.length).toBeLessThan(1000);
  });
});
