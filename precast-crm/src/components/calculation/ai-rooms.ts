// Map AI-extracted rooms into calculator rows. Reuses makeRow() for engine
// defaults (bearing 0.15, AUTO pattern, originalWidth 0 → no undersize warning)
// and recomputeRow() so each row arrives already priced. The live-pricing effect
// in MultiRoomCalculator re-bills on the next /api/pricing payload, matching how
// loadProject() seeds reopened drafts.

import type { ExtractedRoom } from "@/lib/agent/llm/provider";
import { makeRow, recomputeRow, type SlabRow } from "./MultiRoomCalculator";

/**
 * @param rooms     rooms read by the AI (widthM = эни, lengthM = Уз)
 * @param startSeq  number of existing rows (so labels continue: startSeq+1…)
 */
export function aiRoomsToSlabRows(rooms: ExtractedRoom[], startSeq: number): SlabRow[] {
  return rooms.map((r, i) => {
    const base = makeRow(startSeq + i + 1);
    return recomputeRow({
      ...base,
      name: r.label?.trim() ? r.label.trim() : base.name,
      innerWidth: r.widthM,
      innerLength: r.lengthM,
    });
  });
}
