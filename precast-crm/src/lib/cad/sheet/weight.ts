import type { SlabResult } from "@/services/calculation-engine";

export const BEAM_KG_PER_M = 32;   // owner-confirmed 2026-06-20
export const FILLER_BLOCK_KG = 16; // owner-confirmed 2026-06-20

export interface RoomWeight {
  beamsKg: number;
  blocksKg: number;
  totalKg: number;
}

/** As-delivered precast truck-load weight (topping concrete excluded). */
export function estimateRoomWeight(calc: SlabResult): RoomWeight {
  const beamsKg = Math.round(calc.beam_count * calc.beam_length * BEAM_KG_PER_M);
  const blocksKg = Math.round(calc.total_blocks * FILLER_BLOCK_KG);
  return { beamsKg, blocksKg, totalKg: beamsKg + blocksKg };
}

/** Sum over rooms. */
export function estimateProjectWeight(calcs: SlabResult[]): RoomWeight {
  let beamsKg = 0;
  let blocksKg = 0;
  for (const c of calcs) {
    const r = estimateRoomWeight(c);
    beamsKg += r.beamsKg;
    blocksKg += r.blocksKg;
  }
  return { beamsKg, blocksKg, totalKg: beamsKg + blocksKg };
}
