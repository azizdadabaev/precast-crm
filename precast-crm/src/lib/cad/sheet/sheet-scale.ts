// Pure paper-space scale math for the drawing sheet. cm = world (the geometry
// layer is centimetres); mm = paper. A ratio of 1:N means N mm world == 1 mm paper.
export interface SheetSize { wMm: number; hMm: number; }
export const A4_LANDSCAPE: SheetSize = { wMm: 297, hMm: 210 };
export const A4_PORTRAIT: SheetSize = { wMm: 210, hMm: 297 };

// "Nice" architectural denominators, ascending (finer → coarser).
export const SCALE_RATIOS = [50, 75, 100, 125, 150, 200, 250, 300, 400, 500] as const;

export interface SheetOptions {
  page: SheetSize;
  marginMm: number;
  /** Multiplies all text sizes; 1 = defaults tuned for A4. */
  fontScale: number;
}
export const DEFAULT_SHEET_OPTIONS: SheetOptions = {
  page: A4_LANDSCAPE,
  marginMm: 10,
  fontScale: 1,
};

export function usableSheetMm(page: SheetSize, marginMm: number): { wMm: number; hMm: number } {
  return { wMm: page.wMm - 2 * marginMm, hMm: page.hMm - 2 * marginMm };
}

export interface ArchScale {
  ratio: number;      // the N in 1:N
  mmPerCm: number;    // paper mm per 1 cm world = 10 / ratio
  drawWMm: number;    // world width rendered, in paper mm
  drawHMm: number;
  overflow: boolean;  // true when even the coarsest ratio doesn't fit (clamped)
}

/** Pick the FIRST (finest) ratio whose world box fits the usable sheet.
 *  worldWcm/worldHcm are the drawing's world extent in centimetres. */
export function pickArchScale(
  worldWcm: number,
  worldHcm: number,
  page: SheetSize,
  marginMm: number,
): ArchScale {
  const { wMm, hMm } = usableSheetMm(page, marginMm);
  return pickArchScaleForBox(worldWcm, worldHcm, wMm, hMm);
}

/** Pick the FIRST (finest) ratio whose world box fits an explicit paper-space
 *  box (wMm × hMm). Used to fit a drawing into a sub-region of the sheet. */
export function pickArchScaleForBox(
  worldWcm: number,
  worldHcm: number,
  wMm: number,
  hMm: number,
): ArchScale {
  for (const ratio of SCALE_RATIOS) {
    const mmPerCm = 10 / ratio;
    const drawWMm = worldWcm * mmPerCm;
    const drawHMm = worldHcm * mmPerCm;
    if (drawWMm <= wMm + 1e-6 && drawHMm <= hMm + 1e-6) {
      return { ratio, mmPerCm, drawWMm, drawHMm, overflow: false };
    }
  }
  const ratio = SCALE_RATIOS[SCALE_RATIOS.length - 1];
  const mmPerCm = 10 / ratio;
  return { ratio, mmPerCm, drawWMm: worldWcm * mmPerCm, drawHMm: worldHcm * mmPerCm, overflow: true };
}
