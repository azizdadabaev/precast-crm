import { describe, it, expect } from "vitest";
import { snapRect } from "@/lib/layout-board/snap";

const A = { x: 0, y: 0, w: 400, h: 460 };
const opts = { wallCm: 30, thresholdCm: 15 };

describe("layout-board snapRect", () => {
  it("snaps to the wall gap beside a room and aligns tops", () => {
    const r = snapRect({ x: 438, y: 5, w: 300, h: 460 }, [A], opts);
    expect(r.x).toBe(430);
    expect(r.y).toBe(0);
    expect(r.guides.some((g) => g.axis === "x" && g.at === 430)).toBe(true);
  });

  it("falls back to the 5 cm grid when nothing is near", () => {
    const r = snapRect({ x: 2003, y: 1007, w: 300, h: 460 }, [A], opts);
    expect({ x: r.x, y: r.y }).toEqual({ x: 2005, y: 1005 });
    expect(r.guides).toEqual([]);
  });

  it("ignores wall-gap contact when the rooms do not face each other", () => {
    const r = snapRect({ x: 432, y: 600, w: 300, h: 100 }, [A], opts);
    expect(r.guides.filter((g) => g.axis === "x")).toEqual([]);
  });

  it("puts edges touching when the wall is 0", () => {
    const r = snapRect({ x: 405, y: 0, w: 300, h: 460 }, [A], { ...opts, wallCm: 0 });
    expect(r.x).toBe(400);
  });

  it("leaves the position alone with grid off and nothing near", () => {
    const r = snapRect({ x: 2003, y: 1007, w: 300, h: 460 }, [A], { ...opts, grid: false });
    expect({ x: r.x, y: r.y }).toEqual({ x: 2003, y: 1007 });
  });

  it("snaps below a room with the wall gap", () => {
    const r = snapRect({ x: 2, y: 497, w: 400, h: 300 }, [A], opts);
    expect({ x: r.x, y: r.y }).toEqual({ x: 0, y: 490 });
  });
});
