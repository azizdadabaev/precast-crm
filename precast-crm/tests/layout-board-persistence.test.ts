import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { calcResultToCreatePayload } from "@/lib/calc-persistence";
import { calculateSlab } from "@/services/calculation-engine";
import { layoutFromDb, carryLayouts } from "@/lib/layout-board/carry";
import { SaveProjectDraftSchema } from "@/lib/validation";

const result = calculateSlab({ inner_width: 4.6, inner_length: 4.0 });
const room = { innerWidth: 4.6, innerLength: 4.0 };

describe("layout persistence", () => {
  it("writes the room layout into layoutJson", () => {
    const p = calcResultToCreatePayload({ ...room, layout: { x: 10, y: 20, rot: 90 } }, result);
    expect(p.layoutJson).toEqual({ x: 10, y: 20, rot: 90 });
  });

  it("writes DB null when the room is not placed", () => {
    expect(calcResultToCreatePayload(room, result).layoutJson).toBe(Prisma.DbNull);
    expect(calcResultToCreatePayload({ ...room, layout: null }, result).layoutJson).toBe(Prisma.DbNull);
  });

  it("reads a valid layout back and drops anything else", () => {
    expect(layoutFromDb({ x: 1, y: 2, rot: 0 })).toEqual({ x: 1, y: 2, rot: 0 });
    expect(layoutFromDb({ x: 1, y: 2, rot: 45 })).toBeNull();
    expect(layoutFromDb(null)).toBeNull();
    expect(layoutFromDb("x")).toBeNull();
  });

  it("re-quote with the same room count keeps positions by order", () => {
    const L1 = { x: 0, y: 0, rot: 0 as const };
    const L2 = { x: 500, y: 0, rot: 90 as const };
    const out = carryLayouts([L1, L2], [{ n: "a" }, { n: "b" }]);
    expect(out.map((r) => r.layout)).toEqual([L1, L2]);
  });

  it("a room the operator took off the board (layout null) stays off", () => {
    const out = carryLayouts([{ x: 0, y: 0, rot: 0 }], [{ n: "a", layout: null }]);
    expect(out[0].layout).toBeNull();
  });

  it("re-quote with a different room count sends every room back to the tray", () => {
    const out = carryLayouts([{ x: 0, y: 0, rot: 0 }], [{ n: "a", layout: { x: 9, y: 9, rot: 0 } }, { n: "b" }]);
    expect(out.map((r) => r.layout)).toEqual([null, null]);
  });

  it("draft schema keeps wall thickness and room layout, rejects a wall over 100 cm", () => {
    const base = { clientPhone: "+998901234567", rooms: [{ ...room, layout: { x: 5, y: 5, rot: 0 } }] };
    const parsed = SaveProjectDraftSchema.parse({ ...base, layoutWallCm: 30 });
    expect(parsed.layoutWallCm).toBe(30);
    expect(parsed.rooms[0].layout).toEqual({ x: 5, y: 5, rot: 0 });
    expect(SaveProjectDraftSchema.safeParse({ ...base, layoutWallCm: 150 }).success).toBe(false);
  });
});
