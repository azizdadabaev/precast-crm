import { describe, expect, it } from "vitest";
import { pointFromPolar } from "@/lib/cad/geometry";

// Direct distance/angle entry helper: place a point at an exact distance + bearing
// from an origin, in the y-DOWN screen convention used by the CAD room editor
// (bearing 0 → +x right, 90 → +y down, −90 → −y up, 180 → −x left).
describe("pointFromPolar", () => {
  it("0° points +x (right)", () => {
    const p = pointFromPolar({ x: 0, y: 0 }, 100, 0);
    expect(p.x).toBeCloseTo(100, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });

  it("90° points +y (down)", () => {
    const p = pointFromPolar({ x: 0, y: 0 }, 100, 90);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(100, 6);
  });

  it("−90° points −y (up)", () => {
    const p = pointFromPolar({ x: 0, y: 0 }, 100, -90);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(-100, 6);
  });

  it("180° points −x (left)", () => {
    const p = pointFromPolar({ x: 0, y: 0 }, 100, 180);
    expect(p.x).toBeCloseTo(-100, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });

  it("45° resolves the diagonal (down-right)", () => {
    const p = pointFromPolar({ x: 0, y: 0 }, 100, 45);
    expect(p.x).toBeCloseTo(70.710678, 6);
    expect(p.y).toBeCloseTo(70.710678, 6);
  });

  it("is relative to a non-zero origin", () => {
    const p = pointFromPolar({ x: 10, y: 20 }, 100, 0);
    expect(p.x).toBeCloseTo(110, 6);
    expect(p.y).toBeCloseTo(20, 6);
  });
});
