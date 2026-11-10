/**
 * The client sheet «Плита жойлашуви — юқоридан кўриниш» as one self-contained SVG
 * (A4 landscape proportion, fixed print colours). Placed rooms are drawn with dark
 * walls, beams and block rows; totals always cover the WHOLE quote (sheetTotals).
 * The logo must be a data: URL — SVG rendered to a canvas cannot fetch images.
 */
import type { SlabRow } from "@/components/calculation/MultiRoomCalculator";
import { beamLayout, type CadPattern } from "@/lib/cad/geometry";
import { isPlaceable, roomRect, slabRect, type CmRect } from "./model";
import { sheetTotals } from "./totals";
import { roomLabelLines } from "./labels";
import { fmtFixed, fmtInt } from "./format";

export const SHEET_W = 2970;
export const SHEET_H = 2100;
const COMPANY_PHONE = "+998 93 481 33 30";

const C = {
  paper: "#F7F7F5", ink: "#1E2328", muted: "#7A8088", wall: "#2B2E33", room: "#FFFFFF",
  beam: "#3E6B66", beamEdge: "#24403D", block: "#E6E3DC", blockEdge: "#B9B4A8", accent: "#B4532A", rule: "#D9DCE0",
};

export type SheetMeta = {
  projectName: string | null;
  clientName: string | null;
  date: Date;
  wallCm: number;
  logoHref: string;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ddmmyyyy = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;

function text(x: number, y: number, s: string, size: number, opts: { weight?: number; fill?: string; anchor?: string } = {}) {
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size.toFixed(1)}" font-weight="${opts.weight ?? 400}" fill="${opts.fill ?? C.ink}" text-anchor="${opts.anchor ?? "start"}" font-family="Arial, sans-serif" style="font-variant-numeric: tabular-nums">${esc(s)}</text>`;
}

export function buildLayoutSheetSvg(rows: SlabRow[], meta: SheetMeta): string {
  const totals = sheetTotals(rows);
  const placed = rows.filter((r) => r.layout && isPlaceable(r));
  const number = (id: string) => rows.findIndex((r) => r.id === id) + 1;
  const out: string[] = [];

  // ── drawing area: fit placed rooms (with walls) between header and footer
  const area = { x: 120, y: 330, w: SHEET_W - 240, h: SHEET_H - 330 - 380 };
  const wall = meta.wallCm;
  const rects = placed.map((r) => roomRect(r, r.layout!));
  let s = 1, ox = area.x, oy = area.y;
  if (rects.length) {
    const x0 = Math.min(...rects.map((r) => r.x)) - wall;
    const y0 = Math.min(...rects.map((r) => r.y)) - wall;
    const x1 = Math.max(...rects.map((r) => r.x + r.w)) + wall;
    const y1 = Math.max(...rects.map((r) => r.y + r.h)) + wall;
    s = Math.min(area.w / (x1 - x0), area.h / (y1 - y0), 2);
    ox = area.x + (area.w - (x1 - x0) * s) / 2 - x0 * s;
    oy = area.y + (area.h - (y1 - y0) * s) / 2 - y0 * s;
  }
  const P = (r: CmRect) =>
    `x="${(ox + r.x * s).toFixed(1)}" y="${(oy + r.y * s).toFixed(1)}" width="${(r.w * s).toFixed(1)}" height="${(r.h * s).toFixed(1)}"`;

  out.push(`<rect width="${SHEET_W}" height="${SHEET_H}" fill="${C.paper}"/>`);

  // walls first (all rooms), then rooms — no wall covers a neighbour's beam ends
  for (const r of rects) out.push(`<rect ${P({ x: r.x - wall, y: r.y - wall, w: r.w + 2 * wall, h: r.h + 2 * wall })} fill="${C.wall}"/>`);
  for (const row of placed) {
    const res = row.result!;
    const room = roomRect(row, row.layout!);
    out.push(`<rect ${P(room)} fill="${C.room}"/>`);
    const bay = beamLayout(
      { rect: slabRect(row, row.layout!), beamDir: row.layout!.rot === 0 ? "V" : "H" },
      res.beam_count, res.block_rows, res.blocks_per_row, res.beam_length * 100,
      res.pattern as CadPattern, row.bearing * 100,
    );
    for (const c of bay.blockCells) {
      out.push(`<rect ${P({ x: c.x + 0.8, y: c.y + 0.8, w: Math.max(0, c.w - 1.6), h: Math.max(0, c.h - 1.6) })} fill="${C.block}" stroke="${C.blockEdge}" stroke-width="0.8"/>`);
    }
    for (const b of bay.beams) out.push(`<rect ${P(b)} fill="${C.beam}" stroke="${C.beamEdge}" stroke-width="1"/>`);
  }
  for (const row of placed) {
    const room = roomRect(row, row.layout!);
    const lines = roomLabelLines(row);
    const wPx = room.w * s;
    const hPx = room.h * s;
    const fs = Math.max(11, Math.min(26, Math.min(wPx, hPx) / 9));
    const bw = Math.min(wPx - 10, fs * 10);
    const bh = fs * 1.35 * (lines.length + 1) + fs * 0.7;
    const cx = ox + (room.x + room.w / 2) * s;
    const cy = oy + (room.y + room.h / 2) * s;
    out.push(`<rect x="${(cx - bw / 2).toFixed(1)}" y="${(cy - bh / 2).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="${(fs * 0.4).toFixed(1)}" fill="#FFFFFF" fill-opacity="0.93" stroke="${C.rule}" stroke-width="1.5"/>`);
    out.push(text(cx, cy - bh / 2 + fs * 1.35, String(number(row.id)), fs * 1.15, { weight: 700, fill: C.accent, anchor: "middle" }));
    lines.forEach((t, i) =>
      out.push(text(cx, cy - bh / 2 + fs * 1.35 * (i + 2), t, i === 1 ? fs : fs * 0.85, {
        weight: i === 1 || i === 3 ? 700 : 400,
        fill: i === 0 ? C.muted : i === 3 ? C.accent : C.ink,
        anchor: "middle",
      })),
    );
  }

  // ── header
  out.push(`<image href="${esc(meta.logoHref)}" x="120" y="80" width="300" height="117"/>`);
  out.push(text(480, 140, "Плита жойлашуви — юқоридан кўриниш", 58, { weight: 700 }));
  const sub = [
    meta.projectName ? `Лойиҳа ${meta.projectName}` : null,
    meta.clientName,
    `${totals.roomCount} хона`,
    ddmmyyyy(meta.date),
  ].filter(Boolean).join(" · ");
  out.push(text(480, 196, sub, 34, { fill: C.muted }));
  out.push(text(SHEET_W - 120, 140, COMPANY_PHONE, 40, { weight: 700, anchor: "end" }));
  out.push(text(SHEET_W - 120, 190, "Yig'ma monolit", 32, { fill: C.muted, anchor: "end" }));
  out.push(`<rect x="120" y="240" width="${SHEET_W - 240}" height="3" fill="${C.ink}"/>`);

  // ── footer: legend (right of the first chip row), chips that wrap, note above them
  const unplaced = totals.roomCount - totals.placedCount;
  const chips = [
    ...totals.beamsByLength.map((b) => `Балка ${fmtFixed(b.lengthM)} м — ${fmtInt(b.count)} та`),
    `Ғишт — ${fmtInt(totals.totalBlocks)} та`,
    `Майдон — ${fmtFixed(totals.totalAreaM2)} м²`,
  ];
  const legend: [string, string, string?][] = [["балка", C.beam], ["ғишт (блок)", C.block, C.blockEdge], ["девор", C.wall]];
  const legendW = legend.reduce((sum, [label]) => sum + label.length * 17 + 70 + 30, 0);
  const legendLeft = SHEET_W - 120 - legendW + 30;
  const left = 120;
  const firstRowRight = legendLeft - 40;
  const fullRight = SHEET_W - 120;

  // Wrap chips into rows; shrink the type when two rows at full size are not enough.
  const place = (font: number) => {
    const h = Math.round(font * 2.35);
    const gap = 16;
    const rowsOut: { x: number; w: number; text: string }[][] = [[]];
    let x = left;
    for (const c of chips) {
      const w = Math.round(c.length * font * 0.56 + font * 1.65);
      const right = rowsOut.length === 1 ? firstRowRight : fullRight;
      if (x > left && x + w > right) {
        rowsOut.push([]);
        x = left;
      }
      rowsOut[rowsOut.length - 1].push({ x, w, text: c });
      x += w + 22;
    }
    return { font, h, gap, rows: rowsOut };
  };
  let fit = place(34);
  if (fit.rows.length > 2) fit = place(26);
  const chipsH = fit.rows.length * (fit.h + fit.gap) - fit.gap;
  const fy = SHEET_H - 60 - chipsH - 50;

  const note = unplaced > 0
    ? `${unplaced} хона жойлаштирилмаган — миқдорлар барча хоналар бўйича`
    : `Хона ўлчамлари — ички. Девор қалинлиги ${fmtInt(wall)} см. Балка ҳар томондан ${fmtInt((rows[0]?.bearing ?? 0.15) * 100)} см деворга киради.`;
  out.push(text(120, fy - 40, note, 28, { fill: unplaced > 0 ? C.accent : C.muted }));
  out.push(`<rect x="120" y="${fy}" width="${SHEET_W - 240}" height="2" fill="${C.rule}"/>`);
  fit.rows.forEach((row, ri) => {
    const y = fy + 50 + ri * (fit.h + fit.gap);
    for (const c of row) {
      out.push(`<rect x="${c.x}" y="${y}" width="${c.w}" height="${fit.h}" rx="14" fill="#FFFFFF" stroke="${C.rule}" stroke-width="2"/>`);
      out.push(text(c.x + fit.font * 0.82, y + fit.h * 0.65, c.text, fit.font, { weight: 600 }));
    }
  });
  const ly = fy + 50 + fit.h / 2 - 13;
  let lx = SHEET_W - 120;
  for (const [label, fill, edge] of [...legend].reverse()) {
    const w = label.length * 17 + 70;
    lx -= w;
    out.push(`<rect x="${lx}" y="${ly}" width="44" height="26" rx="4" fill="${fill}"${edge ? ` stroke="${edge}" stroke-width="2"` : ""}/>`);
    out.push(text(lx + 56, ly + 23, label, 28, { fill: C.muted }));
    lx -= 30;
  }

  // ── one faint centred watermark (owner's style: ~30 % width, ~8 % opacity)
  const wmW = SHEET_W * 0.3;
  out.push(`<image href="${esc(meta.logoHref)}" x="${(SHEET_W - wmW) / 2}" y="${(SHEET_H - wmW * 0.389) / 2}" width="${wmW}" height="${(wmW * 0.389).toFixed(1)}" opacity="0.08"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_W}" height="${SHEET_H}" viewBox="0 0 ${SHEET_W} ${SHEET_H}">${out.join("")}</svg>`;
}
