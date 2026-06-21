import { describe, it, expect } from "vitest";
import { unionShapes, subtractShapes, intersectShapes } from "@/lib/cad/boolean";
import type { Pt } from "@/lib/cad/geometry";

const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

const area = (pts: Pt[]): number => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a / 2);
};

describe("boolean ops on rooms", () => {
  it("union of two OVERLAPPING rectangles → one shape covering both", () => {
    const out = unionShapes([
      { points: rect(0, 0, 110, 100) },
      { points: rect(100, 0, 200, 100) },
    ]);
    expect(out).toHaveLength(1);
    expect(area(out[0].points)).toBeCloseTo(20000, 0); // 200×100
    expect(out[0].holes).toHaveLength(0);
  });

  it("union of DISJOINT rectangles → two shapes", () => {
    const out = unionShapes([
      { points: rect(0, 0, 50, 50) },
      { points: rect(100, 100, 150, 150) },
    ]);
    expect(out).toHaveLength(2);
  });

  it("subtract a centered rectangle → one shape with a hole (net area)", () => {
    const out = subtractShapes({ points: rect(0, 0, 200, 200) }, [
      { points: rect(75, 75, 125, 125) },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].holes).toHaveLength(1);
    const net = area(out[0].points) - area(out[0].holes[0]);
    expect(net).toBeCloseTo(40000 - 2500, 0);
  });

  it("intersect two overlapping rectangles → the overlap rectangle", () => {
    const out = intersectShapes([
      { points: rect(0, 0, 100, 100) },
      { points: rect(50, 50, 150, 150) },
    ]);
    expect(out).toHaveLength(1);
    expect(area(out[0].points)).toBeCloseTo(2500, 0); // 50×50
  });
});
