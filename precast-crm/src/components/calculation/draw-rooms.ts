// Map drawn CAD bays into calculator rows. Mirrors ai-rooms.ts: reuses
// makeRow() for engine defaults and recomputeRow() so each row arrives priced.
// Each bay → one SlabRow; the bay's along-beam extent becomes innerWidth and
// the perpendicular extent becomes innerLength (via bayToSlabInput, in metres).

import { bayToSlabInput, type Bay } from "@/lib/cad/geometry";
import { makeRow, recomputeRow, type SlabRow } from "./MultiRoomCalculator";

/**
 * @param bays      decomposed bays (each with a chosen beamDir)
 * @param startSeq  number of existing rows (so labels continue: startSeq+1…)
 */
export function baysToSlabRows(bays: Bay[], startSeq: number): SlabRow[] {
  return bays.map((bay, i) => {
    const seq = startSeq + i + 1;
    const base = makeRow(seq);
    const { inner_width, inner_length } = bayToSlabInput(bay);
    return recomputeRow({
      ...base,
      // "Хона N" matches makeRow's default scheme; the engineering snapshot
      // stays 0 (operator-owned dimensions) like a hand-typed room.
      name: `Хона ${seq}`,
      innerWidth: inner_width,
      innerLength: inner_length,
    });
  });
}
