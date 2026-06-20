import type { SlabRow } from "@/components/calculation/MultiRoomCalculator";

export interface SheetRoomPayload {
  name?: string;
  inner_width: number;
  inner_length: number;
  beamDir?: "H" | "V";
}

/**
 * Map calculator rows → /api/drawings/render payload. Skips rows with
 * non-positive dims.
 *
 * `SlabRow` carries no explicit beam-direction field (the engine derives
 * the bay layout from the pattern + dimensions), so `beamDir` is omitted —
 * the render route treats it as optional and defaults the orientation.
 */
export function slabRowsToSheetPayload(rows: SlabRow[]): SheetRoomPayload[] {
  const out: SheetRoomPayload[] = [];
  for (const row of rows) {
    const inner_width = Number(row.innerWidth);
    const inner_length = Number(row.innerLength);
    if (!(inner_width > 0) || !(inner_length > 0)) continue;

    const payload: SheetRoomPayload = { inner_width, inner_length };
    if (row.name) payload.name = row.name;
    out.push(payload);
  }
  return out;
}
