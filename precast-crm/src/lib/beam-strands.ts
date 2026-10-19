// Prestressed strands per T-beam, for the cutting floor.
//
// The owner decides strands when pricing a room: the m² rate level IS the
// strand decision (owner 2026-10-19). Workers only see beam lengths and cut
// everything over ~4,5 m with 5 strands, so a long beam priced at the first
// rate (4 strands) got the wrong cut. The load list now carries the count.
//
// Pure and browser-safe: the order API attaches `strands` to each room, the
// web order page and the Android app only display it.

import { lengthKey } from '@/lib/fulfilment';

/** Strands per m² rate level, aligned to M2_PRICE_TIERS (140k, 160k, 180k, 200k, 230k). */
export const STRANDS_BY_LEVEL = [4, 5, 5, 6, 6] as const;

/** Beams longer than this are marked for attention in the load list. */
export const LONG_BEAM_M = 4.3;

interface M2Tier {
  max_beam_length: number;
  price: number;
}

export interface StrandRoom {
  beamLength: number;
  m2Price: number;
  m2PriceOverride: boolean;
}

/**
 * The room's rate level. An auto-priced room's rate came from its length
 * bracket, so the bracket is the level — later price edits cannot move it.
 * A typed rate takes the highest level whose current price it reaches.
 */
function rateLevel(room: StrandRoom, tiers: readonly M2Tier[]): number {
  if (!room.m2PriceOverride) {
    const i = tiers.findIndex((t) => room.beamLength <= t.max_beam_length + 1e-9);
    return i === -1 ? tiers.length - 1 : i;
  }
  let level = 0;
  tiers.forEach((t, i) => {
    if (room.m2Price >= t.price) level = i;
  });
  return level;
}

export function beamStrands(room: StrandRoom, tiers: readonly M2Tier[]): number {
  return STRANDS_BY_LEVEL[Math.min(rateLevel(room, tiers), STRANDS_BY_LEVEL.length - 1)];
}

export function isLongBeam(beamLength: number | string): boolean {
  return Number(beamLength) > LONG_BEAM_M + 1e-9;
}

export interface LoadListLine {
  beamLength: string;
  strands: number | null;
  totalCount: number;
}

/** The load list: beams per length and strand count, in room order. */
export function loadListLines(
  rooms: Array<{ beamLength: number | string; beamCount: number; strands?: number | null }>,
): LoadListLine[] {
  const lines = new Map<string, LoadListLine>();
  for (const r of rooms) {
    if (!(r.beamCount > 0)) continue;
    const beamLength = lengthKey(r.beamLength);
    const strands = r.strands ?? null;
    const key = `${beamLength}|${strands}`;
    const line = lines.get(key) ?? { beamLength, strands, totalCount: 0 };
    line.totalCount += r.beamCount;
    lines.set(key, line);
  }
  return Array.from(lines.values());
}
