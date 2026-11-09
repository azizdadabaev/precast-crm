/** Room label lines shared by the board and the exported sheet (client-facing, Uzbek). */
import { PATTERN_LABEL, type SlabRow } from "@/components/calculation/MultiRoomCalculator";
import { fmtFixed } from "./format";

export function roomLabelLines(row: SlabRow): string[] {
  const r = row.result!;
  return [
    `хона ${fmtFixed(row.innerWidth)} × ${fmtFixed(row.innerLength)}`,
    `плита ${fmtFixed(r.beam_length)} × ${fmtFixed(r.monolith_length)}`,
    `${PATTERN_LABEL[r.pattern]} · ${r.beam_count} балка`,
    `${fmtFixed(r.monolith_area)} м²`,
  ];
}
