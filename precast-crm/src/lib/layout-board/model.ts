/**
 * Layout board model: where a calculator room sits on the top-view board.
 *
 * Board space is centimetres, y down. A room is positioned by its INNER rectangle
 * (that is what snaps, with a wall gap between rooms); the slab drawn on top is
 * beam_length across the beams (running into the walls) × monolith_length along
 * the row of beams, centred on the room. Unrotated, beams span the room's width
 * vertically on screen.
 */
import { z } from "zod";
import type { SlabRow } from "@/components/calculation/MultiRoomCalculator";

export type RoomLayout = { x: number; y: number; rot: 0 | 90 };

const coord = z.number().finite().min(-100_000).max(100_000);

export const RoomLayoutSchema = z.object({
  x: coord,
  y: coord,
  rot: z.union([z.literal(0), z.literal(90)]),
});

export const WALL_CM_DEFAULT = 30;
export const GRID_CM = 5;

export type CmRect = { x: number; y: number; w: number; h: number };

/** Metres → centimetres without float drift (4.6 × 100 = 459.99…): snapping compares edges exactly. */
export function toCm(m: number): number {
  return Math.round(m * 10_000) / 100;
}

/** A row can go on the board only when it is calculated and is a real room. */
export function isPlaceable(row: SlabRow): boolean {
  return row.result != null && !row.result.is_extras_only;
}

export function roomRect(row: SlabRow, layout: RoomLayout): CmRect {
  const along = toCm(row.innerLength);
  const across = toCm(row.innerWidth);
  return layout.rot === 0
    ? { x: layout.x, y: layout.y, w: along, h: across }
    : { x: layout.x, y: layout.y, w: across, h: along };
}

export function slabRect(row: SlabRow, layout: RoomLayout): CmRect {
  const room = roomRect(row, layout);
  const along = toCm(row.result?.monolith_length ?? row.innerLength);
  const across = toCm(row.result?.beam_length ?? row.innerWidth);
  const w = layout.rot === 0 ? along : across;
  const h = layout.rot === 0 ? across : along;
  return { x: room.x + (room.w - w) / 2, y: room.y + (room.h - h) / 2, w, h };
}

export function overlaps(a: CmRect, b: CmRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
