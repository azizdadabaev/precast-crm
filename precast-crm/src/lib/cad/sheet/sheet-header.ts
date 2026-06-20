import { SHEET_BRAND } from "@/lib/cad/sheet/brand";
import type { SheetOptions } from "@/lib/cad/sheet/sheet-scale";
import type { PlanPrimitive } from "@/lib/cad/sheet/sheet-plan";

/** Height (mm) reserved for the branded header band at the top of the page. */
export const HEADER_H_MM = 12;

/**
 * Emits primitives for the branded header band.
 * The band spans from the left margin to the right margin,
 * inside the top HEADER_H_MM mm of the usable area (i.e. starting at marginMm).
 */
export function buildHeaderBand(opts: SheetOptions): PlanPrimitive[] {
  const { marginMm, fontScale, page } = opts;
  const leftX = marginMm;
  const rightX = page.wMm - marginMm;
  const bandTopY = marginMm;
  const bandBottomY = marginMm + HEADER_H_MM;
  // Vertical centre of the band for text placement.
  const midY = (bandTopY + bandBottomY) / 2;

  return [
    // Bottom divider line separating the header from the drawing area.
    {
      type: "line",
      role: "header",
      x1Mm: leftX,
      y1Mm: bandBottomY,
      x2Mm: rightX,
      y2Mm: bandBottomY,
    },
    // Company name — left-aligned, slightly larger.
    {
      type: "text",
      role: "name",
      xMm: leftX,
      yMm: midY,
      text: SHEET_BRAND.name,
      sizeMm: 4.2 * fontScale,
      align: "L",
    },
    // Phone — right-aligned, slightly smaller.
    {
      type: "text",
      role: "stamp",
      xMm: rightX,
      yMm: midY,
      text: SHEET_BRAND.phone,
      sizeMm: 3.2 * fontScale,
      align: "R",
    },
  ];
}
