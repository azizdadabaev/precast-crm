/**
 * «Автоматик жойлаш»: put every unplaced, placeable room in one row, one wall apart,
 * to the right of whatever is already on the board, top-aligned with it.
 */
import type { SlabRow } from "@/components/calculation/MultiRoomCalculator";
import { isPlaceable, roomRect, type RoomLayout } from "./model";

export function autoArrange(
  rows: SlabRow[],
  placed: Map<string, RoomLayout>,
  wallCm: number,
): Map<string, RoomLayout> {
  let right = -Infinity;
  let top = Infinity;
  for (const row of rows) {
    const l = placed.get(row.id);
    if (!l) continue;
    const r = roomRect(row, l);
    right = Math.max(right, r.x + r.w);
    top = Math.min(top, r.y);
  }
  let x = right === -Infinity ? 0 : right + wallCm;
  const y = top === Infinity ? 0 : top;

  const out = new Map<string, RoomLayout>();
  for (const row of rows) {
    if (placed.has(row.id) || !isPlaceable(row)) continue;
    const layout: RoomLayout = { x, y, rot: 0 };
    out.set(row.id, layout);
    x += roomRect(row, layout).w + wallCm;
  }
  return out;
}
