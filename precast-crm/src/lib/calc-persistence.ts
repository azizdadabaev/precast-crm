/**
 * Shared mapper: SlabResult → Prisma `calculations.create` payload.
 *
 * Centralized so /api/calculate, /api/projects, /api/orders, and the seed
 * all build the same persistence shape. Add fields here once.
 */

import type { Prisma } from "@prisma/client";
import {
  M2_PRICE_TIERS,
  round2,
  type Pattern,
  type SlabResult,
} from "@/services/calculation-engine";

export interface RoomInput {
  name?: string | null;
  innerWidth: number;
  innerLength: number;
  bearing?: number;
  correction?: number;
  extraBeams?: number;
  forceStartBeam?: boolean;
  patternOverride?: Pattern | null;
  /** Per-row rate override flag. When true, `m2PriceOverrideValue` is used
   *  in place of the engine's auto-pick from beam length. */
  m2PriceOverride?: boolean;
  /** Catalog tier price chosen by the operator (UZS/m²). Required when
   *  `m2PriceOverride` is true; ignored otherwise. The Zod refine in
   *  `RoomCalcInputSchema` enforces both server-side. */
  m2PriceOverrideValue?: number | null;
  /** Optional, max 200 chars. Free text. */
  m2PriceReason?: string | null;
}

/**
 * Build a Prisma create payload (without projectId) from a SlabResult +
 * the input. When the operator has a per-row rate override set, the
 * engine's auto-picked `m2_price` / `m2_cost` / `subtotal` are replaced
 * with values computed against the chosen tier so the persisted row
 * matches exactly what the operator saw at save time.
 */
export function calcResultToCreatePayload(
  room: RoomInput,
  r: SlabResult,
): Omit<Prisma.CalculationUncheckedCreateInput, "projectId"> {
  // Defense-in-depth: only honor an override whose value is a real catalog
  // tier. Zod has already enforced this in /api/projects and /api/orders,
  // but the mapper is the single source of truth for what gets persisted.
  const override =
    room.m2PriceOverride === true && room.m2PriceOverrideValue != null;
  const overrideValue =
    override &&
    M2_PRICE_TIERS.some((t) => t.price === room.m2PriceOverrideValue)
      ? (room.m2PriceOverrideValue as number)
      : null;

  const m2Price = overrideValue ?? r.m2_price;
  const m2Cost =
    overrideValue !== null
      ? round2(r.billed_area * overrideValue)
      : r.m2_cost;
  const subtotal =
    overrideValue !== null
      ? round2(m2Cost + r.pattern_extra_cost + r.manual_extra_beams_cost)
      : r.subtotal;

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
    m2Price,
    m2PriceOverride: overrideValue !== null,
    m2PriceReason:
      overrideValue !== null ? (room.m2PriceReason?.trim() || null) : null,
    extraBeamPricePerM: r.extra_beam_price_per_m,
    m2Cost,
    patternExtraCost: r.pattern_extra_cost,
    manualExtraBeamsCost: r.manual_extra_beams_cost,
    subtotal,
  };
}
