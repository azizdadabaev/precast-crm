// Pure Bill-of-Materials + price block for the drawing sheet. Emits
// PlanPrimitive table cells (text/line/rect) inside a paper-space region.
// Numbers come straight from the engine's calc / projectTotal — never recomputed.
import { projectTotal, type SlabResult, type Pattern } from "@/services/calculation-engine";
import type { SheetOptions } from "@/lib/cad/sheet/sheet-scale";
import type { PlanPrimitive, SheetRegion } from "@/lib/cad/sheet/sheet-plan";

export interface BomRoom { name: string; calc: SlabResult; }

/** Cyrillic pattern labels (Г = балка, Б = ғишт). */
const PATTERN_LABEL: Record<Pattern, string> = {
  GB: "Г-Б",
  BGB: "Б-Г-Б",
  GBG: "Г-Б-Г",
};

/** Thousands-separated with spaces (app convention): 1234000 → "1 234 000". */
const grp = (n: number): string =>
  Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Trim trailing zeros from a metre value: 3.2 → "3.2", 5 → "5". */
const m = (v: number): string => {
  const s = v.toFixed(2);
  return s.replace(/\.?0+$/, "");
};

// Relative column positions (fraction of region width). 7 columns.
const COL_FRAC = [0, 0.18, 0.30, 0.45, 0.65, 0.78, 0.88, 1] as const;
const HEADERS = ["Хона", "Ў×У (м)", "Шаблон", "Балка", "Ғишт", "м²", "Нарх"] as const;

/**
 * Build the schedule table + totals as PlanPrimitive[] laid out top-to-bottom
 * inside `region`. All emitted coords stay within the region box (clamped).
 */
export function buildBomBlock(
  rooms: BomRoom[],
  region: SheetRegion,
  opts: SheetOptions,
  discountPercent = 0,
): PlanPrimitive[] {
  const out: PlanPrimitive[] = [];
  const font = opts.fontScale;
  const cellSize = 2.6 * font;

  // Column x positions (left edge of each cell's text area).
  const colX = (i: number) => region.xMm + COL_FRAC[i] * region.wMm;
  // Right edge of the last column (for right-aligned price cells).
  const rightX = region.xMm + region.wMm;

  // Row geometry: header + N rooms + JAMI + (discount?) + UMUMIY SUMMA.
  const discount = discountPercent > 0;
  const rowCount = 1 + rooms.length + 1 + (discount ? 1 : 0) + 1;
  const idealRowH = 6 * font;
  const rowH = Math.min(idealRowH, region.hMm / rowCount);
  const top = region.yMm;

  const rowYTop = (r: number) => top + r * rowH;       // top edge of row r
  const rowYMid = (r: number) => top + (r + 0.5) * rowH; // text baseline (middle)

  // Horizontal rule helper, clamped to region width.
  const hline = (y: number) =>
    out.push({ type: "line", role: "bom", x1Mm: region.xMm, y1Mm: y, x2Mm: rightX, y2Mm: y });

  // ── Header row ──
  // Light backing rect for the header.
  out.push({ type: "rect", role: "bom", xMm: region.xMm, yMm: rowYTop(0), wMm: region.wMm, hMm: rowH });
  HEADERS.forEach((h, i) => {
    const align = i === 0 ? "L" : "C";
    const x = i === 0 ? colX(0) + 1 : (colX(i) + colX(i + 1)) / 2;
    out.push({ type: "text", role: "bom", xMm: x, yMm: rowYMid(0), text: h, sizeMm: cellSize, align });
  });
  hline(rowYTop(1));

  // ── One row per room ──
  rooms.forEach((room, idx) => {
    const c = room.calc;
    const r = 1 + idx;
    const y = rowYMid(r);
    const cell = (i: number, text: string, align: "L" | "C" | "R") => {
      const x = align === "L" ? colX(i) + 1 : align === "R" ? colX(i + 1) - 1 : (colX(i) + colX(i + 1)) / 2;
      out.push({ type: "text", role: "bom", xMm: x, yMm: y, text, sizeMm: cellSize, align });
    };
    cell(0, room.name, "L");
    cell(1, `${m(c.inner_width)}×${m(c.inner_length)}`, "C");
    cell(2, PATTERN_LABEL[c.pattern], "C");
    cell(3, `${c.beam_count}×${m(c.beam_length)}`, "C");
    cell(4, `${c.total_blocks}`, "C");
    cell(5, m(c.monolith_area), "C");
    cell(6, grp(c.subtotal), "R");
  });
  const afterRoomsRow = 1 + rooms.length;
  hline(rowYTop(afterRoomsRow));

  // ── Totals (authoritative — from projectTotal) ──
  const totals = projectTotal(rooms.map((r) => r.calc), discountPercent);

  const labelCell = (r: number, text: string, bold = false) =>
    out.push({ type: "text", role: bold ? "name" : "bom", xMm: colX(0) + 1, yMm: rowYMid(r), text, sizeMm: cellSize, align: "L" });
  const valueCell = (r: number, text: string, bold = false) =>
    out.push({ type: "text", role: bold ? "name" : "bom", xMm: rightX - 1, yMm: rowYMid(r), text, sizeMm: cellSize, align: "R" });

  let row = afterRoomsRow;
  // JAMI (subtotal before discount)
  labelCell(row, "ЖАМИ");
  valueCell(row, grp(totals.rooms_subtotal));
  row += 1;

  // Discount line (only when applicable)
  if (discount) {
    labelCell(row, `Чегирма ${totals.discount_percent}%`);
    valueCell(row, `-${grp(totals.discount_amount)}`);
    row += 1;
  }

  // UMUMIY SUMMA (grand total) — emphasized.
  hline(rowYTop(row));
  labelCell(row, "УМУМИЙ СУММА", true);
  valueCell(row, grp(totals.total), true);

  return out;
}
