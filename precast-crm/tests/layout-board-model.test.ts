import { describe, it, expect } from "vitest";
import {
  inTray,
  isPlaceable,
  roomRect,
  slabRect,
  overlaps,
  RoomLayoutSchema,
} from "@/lib/layout-board/model";
import type { SlabRow } from "@/components/calculation/MultiRoomCalculator";

// Room 10 of quote 0708D: 4,60 × 4,00 inside, slab 4,90 × 4,06 (Г-Б, 7 beams).
function row(over: Partial<SlabRow> = {}, result: Record<string, unknown> | null = {}): SlabRow {
  return {
    id: "r10",
    name: "Хона 10",
    innerWidth: 4.6,
    innerLength: 4.0,
    bearing: 0.15,
    correction: 0,
    extraBeams: 0,
    forceStartBeam: false,
    patternOverride: "AUTO",
    originalWidth: null,
    m2PriceOverride: false,
    m2PriceOverrideValue: null,
    m2PriceReason: null,
    result:
      result === null
        ? null
        : ({ beam_length: 4.9, monolith_length: 4.06, pattern: "GB", beam_count: 7, is_extras_only: false, ...result } as never),
    ...over,
  } as SlabRow;
}

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.001);

describe("layout-board model", () => {
  it("roomRect is the inner room in cm, beams spanning the height", () => {
    expect(roomRect(row(), { x: 0, y: 0, rot: 0 })).toEqual({ x: 0, y: 0, w: 400, h: 460 });
  });

  it("roomRect swaps sides when turned 90°", () => {
    expect(roomRect(row(), { x: 0, y: 0, rot: 90 })).toEqual({ x: 0, y: 0, w: 460, h: 400 });
  });

  it("slabRect is beam_length × monolith_length centred on the room", () => {
    const s = slabRect(row(), { x: 0, y: 0, rot: 0 });
    close(s.x, -3); close(s.y, -15); close(s.w, 406); close(s.h, 490);
  });

  it("slabRect follows rotation", () => {
    const s = slabRect(row(), { x: 0, y: 0, rot: 90 });
    close(s.x, -15); close(s.y, -3); close(s.w, 490); close(s.h, 406);
  });

  it("isPlaceable is false without a result or for extras-only rows", () => {
    expect(isPlaceable(row())).toBe(true);
    expect(isPlaceable(row({}, null))).toBe(false);
    expect(isPlaceable(row({}, { is_extras_only: true }))).toBe(false);
  });

  it("RoomLayoutSchema validates rotation and bounds", () => {
    expect(RoomLayoutSchema.safeParse({ x: -50, y: 12.5, rot: 90 }).success).toBe(true);
    expect(RoomLayoutSchema.safeParse({ x: 0, y: 0, rot: 45 }).success).toBe(false);
    expect(RoomLayoutSchema.safeParse({ x: Number.NaN, y: 0, rot: 0 }).success).toBe(false);
    expect(RoomLayoutSchema.safeParse({ x: 0, y: 200000, rot: 0 }).success).toBe(false);
  });

  it("overlaps ignores shared edges but catches 1 cm intrusion", () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    expect(overlaps(a, { x: 100, y: 0, w: 50, h: 50 })).toBe(false);
    expect(overlaps(a, { x: 99, y: 0, w: 50, h: 50 })).toBe(true);
  });

  it("inTray: unplaced rooms, and placed rows that are no longer placeable, show in the tray", () => {
    expect(inTray(row())).toBe(true);
    expect(inTray(row({ layout: { x: 0, y: 0, rot: 0 } }))).toBe(false);
    expect(inTray(row({ layout: { x: 0, y: 0, rot: 0 } }, null))).toBe(true);
    expect(inTray(row({ layout: { x: 0, y: 0, rot: 0 } }, { is_extras_only: true }))).toBe(true);
  });
});
