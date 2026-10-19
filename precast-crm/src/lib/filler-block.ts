// Filler block type for the loaders (owner 2026-10-19). Two heights cover the
// same area, so the choice is a label only: «Тайсон ғишт» (10 cm) and
// «Катта ғишт» (15 cm). Workers know them by the initial, which the load list
// prints the way it prints beam strands: «Ғишт (К) = 924».

export type FillerBlock = "TAYSON" | "KATTA";

export const FILLER_BLOCKS: readonly FillerBlock[] = ["TAYSON", "KATTA"];

const LETTER: Record<FillerBlock, string> = { TAYSON: "Т", KATTA: "К" };
const NAME: Record<FillerBlock, string> = { TAYSON: "Тайсон ғишт · 10 см", KATTA: "Катта ғишт · 15 см" };

/** «Т» / «К», or null when the order predates the choice. */
export function fillerBlockLetter(b: FillerBlock | null | undefined): string | null {
  return b ? LETTER[b] : null;
}

/** Full name with height, for tooltips. */
export function fillerBlockName(b: FillerBlock): string {
  return NAME[b];
}
