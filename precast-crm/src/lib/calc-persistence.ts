/**
 * Shared mapper: SlabResult → Prisma `calculations.create` payload.
 *
 * Centralized so /api/calculate, /api/projects, /api/orders, and the seed
 * all build the same persistence shape. Add fields here once.
 */

import type { Prisma } from "@prisma/client";
import type { Pattern, SlabResult } from "@/services/calculation-engine";

export interface RoomInput {
  name?: string | null;
  innerWidth: number;
  innerLength: number;
  bearing?: number;
  correction?: number;
  extraBeams?: number;
  forceStartBeam?: boolean;
  patternOverride?: Pattern | null;
}

/** Build a Prisma create payload (without projectId) from a SlabResult + the input. */
export function calcResultToCreatePayload(
  room: RoomInput,
  r: SlabResult,
): Omit<Prisma.CalculationUncheckedCreateInput, "projectId"> {
  return {
    name: room.name ?? null,
    innerWidth: r.inner_width,
    innerLength: r.inner_length,
    bearing: r.bearing,
    correction: r.correction,
    extraBeams: r.extra_beams,
    forceStartBeam: r.force_start_beam,
    patternOverride: (room.patternOverride ?? null) as Pattern | null,
    pitches: r.pitches,
    remainder: r.remainder,
    pattern: r.pattern,
    patternAuto: r.pattern_auto,
    beamLength: r.beam_length,
    blocksPerRow: r.blocks_per_row,
    beamCount: r.beam_count,
    blockRows: r.block_rows,
    totalBlocks: r.total_blocks,
    monolithLength: r.monolith_length,
    billedLength: r.billed_length,
    monolithArea: r.monolith_area,
    billedArea: r.billed_area,
    concreteVolume: r.concrete_volume,
    m2Price: r.m2_price,
    extraBeamPricePerM: r.extra_beam_price_per_m,
    m2Cost: r.m2_cost,
    patternExtraCost: r.pattern_extra_cost,
    manualExtraBeamsCost: r.manual_extra_beams_cost,
    subtotal: r.subtotal,
  };
}
