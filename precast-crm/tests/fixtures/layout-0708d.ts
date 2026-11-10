/**
 * Quote 0708D (12 rooms) as calculator rows, results from the real engine.
 * Totals must equal the saved quote: 60 × 4,9 m + 8 × 6,1 m beams, 1 554 blocks, 193,02 m².
 * Room 8 reproduces the quote's quantities (4 beams, 1,86 m) via start beam + 1 extra beam.
 */
import { calculateSlab } from "@/services/calculation-engine";
import type { SlabRow } from "@/components/calculation/MultiRoomCalculator";

const ROOMS: { w: number; l: number; force?: boolean; extra?: number }[] = [
  { w: 4.6, l: 3.45 }, { w: 4.6, l: 3.77 }, { w: 4.6, l: 2.1 }, { w: 4.6, l: 1.97 },
  { w: 4.6, l: 3.73 }, { w: 4.6, l: 3.52 }, { w: 4.6, l: 4.13 }, { w: 5.8, l: 1.61, force: true, extra: 1 },
  { w: 4.6, l: 3.65 }, { w: 4.6, l: 4.0 }, { w: 5.8, l: 1.65, force: true }, { w: 4.6, l: 3.5 },
];

export function rows0708d(): SlabRow[] {
  return ROOMS.map((r, i) => ({
    id: `r${i + 1}`,
    name: `Хона ${i + 1}`,
    innerWidth: r.w,
    innerLength: r.l,
    bearing: 0.15,
    correction: 0,
    extraBeams: r.extra ?? 0,
    forceStartBeam: r.force ?? false,
    patternOverride: "AUTO",
    originalWidth: null,
    m2PriceOverride: false,
    m2PriceOverrideValue: null,
    m2PriceReason: null,
    result: calculateSlab({
      inner_width: r.w,
      inner_length: r.l,
      force_start_beam: r.force ?? false,
      extra_beams: r.extra ?? 0,
    }),
  })) as SlabRow[];
}
