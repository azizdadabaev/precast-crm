/**
 * Quantities printed on the layout sheet. Always summed over EVERY calculated row
 * (placed or not, extras-only included) so the sheet equals the quote table.
 * Area is monolith_area — the quote's МАЙДОН column — never billed area.
 */
import type { SlabRow } from "@/components/calculation/MultiRoomCalculator";

export type SheetTotals = {
  beamsByLength: { lengthM: number; count: number }[];
  totalBlocks: number;
  totalAreaM2: number;
  placedCount: number;
  roomCount: number;
};

export function sheetTotals(rows: SlabRow[]): SheetTotals {
  const byLength = new Map<number, number>();
  let totalBlocks = 0;
  let totalAreaM2 = 0;
  let placedCount = 0;
  let roomCount = 0;
  for (const row of rows) {
    const r = row.result;
    if (!r) continue;
    const len = Math.round(r.beam_length * 100) / 100;
    byLength.set(len, (byLength.get(len) ?? 0) + r.beam_count);
    if (r.is_extras_only) continue;
    roomCount += 1;
    totalBlocks += r.total_blocks;
    totalAreaM2 += r.monolith_area;
    if (row.layout) placedCount += 1;
  }
  const beamsByLength = [...byLength.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lengthM, count]) => ({ lengthM, count }));
  return { beamsByLength, totalBlocks, totalAreaM2, placedCount, roomCount };
}
