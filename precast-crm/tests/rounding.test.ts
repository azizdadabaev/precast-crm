import { describe, expect, it } from "vitest";
import { roundUpToGrid, roundDownToGrid } from "../src/lib/utils";

describe("roundUpToGrid", () => {
  it("snaps non-grid values up to the next 10 cm multiple", () => {
    expect(roundUpToGrid(3.193, 0.1)).toBe(3.2);
    expect(roundUpToGrid(3.01, 0.1)).toBe(3.1);
    expect(roundUpToGrid(3.99, 0.1)).toBe(4.0);
  });

  it("snaps non-grid values up to the next 5 cm multiple", () => {
    expect(roundUpToGrid(3.193, 0.05)).toBe(3.2);
    expect(roundUpToGrid(3.21, 0.05)).toBe(3.25);
    expect(roundUpToGrid(3.06, 0.05)).toBe(3.1);
  });

  it("advances by one grid unit when value is exactly on a grid line", () => {
    expect(roundUpToGrid(3.2, 0.1)).toBe(3.3);
    expect(roundUpToGrid(3.2, 0.05)).toBe(3.25);
    expect(roundUpToGrid(0, 0.1)).toBe(0.1);
  });

  it("survives floating-point drift (0.1 + 0.2 case)", () => {
    expect(roundUpToGrid(0.1 + 0.2, 0.1)).toBe(0.4);
    expect(roundUpToGrid(0.1 + 0.2, 0.05)).toBe(0.35);
  });
});

describe("roundDownToGrid", () => {
  it("snaps non-grid values down to the previous 10 cm multiple", () => {
    expect(roundDownToGrid(3.193, 0.1)).toBe(3.1);
    expect(roundDownToGrid(3.01, 0.1)).toBe(3.0);
    expect(roundDownToGrid(3.99, 0.1)).toBe(3.9);
  });

  it("snaps non-grid values down to the previous 5 cm multiple", () => {
    expect(roundDownToGrid(3.193, 0.05)).toBe(3.15);
    expect(roundDownToGrid(3.21, 0.05)).toBe(3.2);
    expect(roundDownToGrid(3.06, 0.05)).toBe(3.05);
  });

  it("retreats by one grid unit when value is exactly on a grid line", () => {
    expect(roundDownToGrid(3.2, 0.1)).toBe(3.1);
    expect(roundDownToGrid(3.2, 0.05)).toBe(3.15);
  });

  it("survives floating-point drift", () => {
    expect(roundDownToGrid(0.1 + 0.2, 0.1)).toBe(0.2);
  });
});

describe("guard rails", () => {
  it("returns the value unchanged for non-positive grid", () => {
    expect(roundUpToGrid(3.193, 0)).toBe(3.193);
    expect(roundDownToGrid(3.193, 0)).toBe(3.193);
    expect(roundUpToGrid(3.193, -0.1)).toBe(3.193);
  });

  it("returns the value unchanged for non-finite input", () => {
    expect(roundUpToGrid(NaN, 0.1)).toBeNaN();
    expect(roundDownToGrid(Infinity, 0.1)).toBe(Infinity);
  });
});
