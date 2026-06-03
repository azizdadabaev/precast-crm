import { describe, it, expect } from "vitest";
import { clampBox, isDegenerate, fromDrag, toPixels } from "../src/lib/annotation-box";

describe("annotation-box helpers", () => {
  it("clamps all coords into [0,1] and keeps the box inside the image", () => {
    expect(clampBox({ x: -0.1, y: 0.2, w: 1.5, h: 0.3 })).toEqual({ x: 0, y: 0.2, w: 1, h: 0.3 });
    // x pushed in so x+w stays ≤ 1
    expect(clampBox({ x: 0.9, y: 0.5, w: 0.4, h: 0.2 })).toEqual({ x: 0.9, y: 0.5, w: 0.1, h: 0.2 });
  });

  it("flags a degenerate (near-zero-area) box", () => {
    expect(isDegenerate({ x: 0.1, y: 0.1, w: 0, h: 0.4 })).toBe(true);
    expect(isDegenerate({ x: 0.1, y: 0.1, w: 0.2, h: 0 })).toBe(true);
    expect(isDegenerate({ x: 0.1, y: 0.1, w: 0.2, h: 0.4 })).toBe(false);
  });

  it("fromDrag normalizes pixel corners regardless of drag direction", () => {
    // drag bottom-right → top-left on a 200×100 image
    expect(fromDrag({ x: 80, y: 60 }, { x: 20, y: 10 }, { width: 200, height: 100 })).toEqual({
      x: 0.1, y: 0.1, w: 0.3, h: 0.5,
    });
  });

  it("toPixels maps a normalized box back to the rendered size", () => {
    const px = toPixels({ x: 0.1, y: 0.1, w: 0.3, h: 0.5 }, 200, 100);
    expect(px.x).toBeCloseTo(20, 6);
    expect(px.y).toBeCloseTo(10, 6);
    expect(px.w).toBeCloseTo(60, 6);
    expect(px.h).toBeCloseTo(50, 6);
  });
});
