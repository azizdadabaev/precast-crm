import { describe, it, expect } from "vitest";
import { normalizeDrawing } from "@/store/calculator";

describe("normalizeDrawing — stable room ids", () => {
  it("mints an id for legacy id-less rooms", () => {
    const d = normalizeDrawing({
      rooms: [
        { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], closed: true },
      ],
      globalDir: null,
      dirOverrides: {},
    });
    expect(d).not.toBeNull();
    expect(typeof d!.rooms[0].id).toBe("string");
    expect(d!.rooms[0].id).toBeTruthy();
  });

  it("preserves an existing room id (stable across reloads)", () => {
    const d = normalizeDrawing({
      rooms: [{ id: "r-keep", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], closed: false }],
    });
    expect(d!.rooms[0].id).toBe("r-keep");
  });

  it("wraps a legacy single-outline {points} shape as one closed room with an id", () => {
    const d = normalizeDrawing({
      points: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }],
    });
    expect(d!.rooms).toHaveLength(1);
    expect(d!.rooms[0].closed).toBe(true);
    expect(d!.rooms[0].id).toBeTruthy();
  });

  it("mints distinct ids for multiple legacy rooms", () => {
    const d = normalizeDrawing({
      rooms: [
        { points: [{ x: 0, y: 0 }], closed: false },
        { points: [{ x: 5, y: 5 }], closed: false },
      ],
    });
    expect(d!.rooms[0].id).not.toBe(d!.rooms[1].id);
  });

  it("returns null for empty / garbage", () => {
    expect(normalizeDrawing(null)).toBeNull();
    expect(normalizeDrawing({})).toBeNull();
    expect(normalizeDrawing({ rooms: [] })).toBeNull();
  });
});
