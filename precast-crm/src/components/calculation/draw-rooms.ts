// Map drawn CAD bays into calculator rows. Mirrors ai-rooms.ts: reuses
// makeRow() for engine defaults and recomputeRow() so each row arrives priced.
// Each bay → one SlabRow; the bay's along-beam extent becomes innerWidth and
// the perpendicular extent becomes innerLength (via bayToSlabInput, in metres).

import { bayToSlabInput, PITCH_CM, BEARING_CM, type Bay } from "@/lib/cad/geometry";
import type { BeamScheduleRow } from "@/lib/cad/beam-scan";
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

/**
 * Map a TAPERED / irregular room's scanline beam SCHEDULE into calculator rows.
 *
 * A tapered outline (any angled wall) can't be expressed as one rectangular bay,
 * so the dialog routes it through the scanline engine (`scanBeams` → `beamSchedule`)
 * which buckets the cast beams by stock length. We turn ONE row per length bucket:
 * `qty` beams that are all `lengthCm` long.
 *
 * MAPPING + ASSUMPTIONS (one schedule bucket → one SlabRow):
 *  - innerWidth (clear span, m) = lengthCm/100 − 2 × bearing. The scanline beam
 *    length is `clear span + 2 × bearing`, and the engine RE-adds 2 × bearing to
 *    get beam_length, so this round-trips back to the same stock length.
 *  - innerLength (m) = qty × PITCH. The engine spaces beams one per PITCH, so a
 *    slab of qty pitches yields ≈ qty beams — i.e. the row's beam count matches
 *    the bucket quantity. This mirrors the tapered sandbox's `buildGroupedRooms`
 *    (innerLength = qty × beamSpacing).
 *
 * The result is an ESTIMATE, not the exact rectangular engine — beam lengths in a
 * real taper vary continuously; here each length bucket becomes its own little
 * rectangular slab whose beams are uniform. The total beam count + per-length
 * cut-list are preserved; the m² is approximate. Rows are labelled "(tapered)"
 * so the operator sees they came from the estimate path, not a measured rectangle.
 *
 * Buckets with a non-positive clear span (degenerate) are skipped.
 *
 * @param schedule  cut-list buckets from `beamSchedule(scanBeams(...))`
 * @param startSeq  number of existing rows (so labels continue: startSeq+1…)
 * @param bearingM  per-end bearing in metres (engine default 0.15)
 */
export function scanScheduleToSlabRows(
  schedule: BeamScheduleRow[],
  startSeq: number,
  bearingM: number = BEARING_CM / 100,
): SlabRow[] {
  const pitchM = PITCH_CM / 100;
  const rows: SlabRow[] = [];
  schedule.forEach((bucket) => {
    const innerWidth = bucket.lengthCm / 100 - 2 * bearingM;
    if (!(innerWidth > 0) || !(bucket.qty > 0)) return; // degenerate bucket
    const seq = startSeq + rows.length + 1;
    const base = makeRow(seq);
    rows.push(
      recomputeRow({
        ...base,
        name: `Хона ${seq} (tapered)`,
        innerWidth,
        // qty beams ≈ qty pitches of slab → the engine's beam_count matches qty.
        innerLength: bucket.qty * pitchM,
        bearing: bearingM,
      }),
    );
  });
  return rows;
}
