import type { SlabResult } from "@/services/calculation-engine";
import type { BeamDir } from "@/lib/cad/geometry";
import { beamLayout, defaultBeamDir } from "@/lib/cad/geometry";
import { pickArchScaleForBox, usableSheetMm, type ArchScale, type SheetOptions } from "@/lib/cad/sheet/sheet-scale";

export interface RoomInput { name: string; calc: SlabResult; beamDir?: BeamDir; }

export type PlanPrimitive =
  | { type: "rect"; role: "outline" | "beam" | "bearing" | "block" | "bom"; xMm: number; yMm: number; wMm: number; hMm: number }
  | { type: "line"; role: "dim" | "witness" | "bom"; x1Mm: number; y1Mm: number; x2Mm: number; y2Mm: number }
  | { type: "text"; role: "dim" | "stamp" | "name" | "bom"; xMm: number; yMm: number; text: string; sizeMm: number; align: "L" | "C" | "R" };

export interface RoomPlan { primitives: PlanPrimitive[]; scale: ArchScale; widthMm: number; heightMm: number; }

/** A rectangular paper-space box (mm) the drawing is fitted/centered into. */
export interface SheetRegion { xMm: number; yMm: number; wMm: number; hMm: number; }

export function buildRoomPlan(room: RoomInput, opts: SheetOptions, region?: SheetRegion): RoomPlan {
  const iwCm = Math.round(room.calc.inner_width * 100);
  const ilCm = Math.round(room.calc.inner_length * 100);
  const rect = { x: 0, y: 0, w: iwCm, h: ilCm };
  const beamDir: BeamDir = room.beamDir ?? defaultBeamDir(rect);
  const layout = beamLayout(
    { rect, beamDir },
    room.calc.beam_count, room.calc.block_rows, room.calc.blocks_per_row,
    Math.round(room.calc.beam_length * 100), room.calc.pattern,
    Math.round(room.calc.bearing * 100),
  );

  const usable = usableSheetMm(opts.page, opts.marginMm);
  const reg: SheetRegion = region ?? { xMm: opts.marginMm, yMm: opts.marginMm, wMm: usable.wMm, hMm: usable.hMm };
  const scale = pickArchScaleForBox(iwCm, ilCm, reg.wMm, reg.hMm);
  const offX = reg.xMm + (reg.wMm - scale.drawWMm) / 2;
  const offY = reg.yMm + (reg.hMm - scale.drawHMm) / 2;
  const X = (cm: number) => offX + cm * scale.mmPerCm;
  const Y = (cm: number) => offY + cm * scale.mmPerCm;
  const S = (cm: number) => cm * scale.mmPerCm;

  const primitives: PlanPrimitive[] = [];
  primitives.push({ type: "rect", role: "outline", xMm: X(0), yMm: Y(0), wMm: S(iwCm), hMm: S(ilCm) });
  for (const b of layout.beams) primitives.push({ type: "rect", role: "beam", xMm: X(b.x), yMm: Y(b.y), wMm: S(b.w), hMm: S(b.h) });
  for (const b of layout.bearings) primitives.push({ type: "rect", role: "bearing", xMm: X(b.x), yMm: Y(b.y), wMm: S(b.w), hMm: S(b.h) });
  const dimSize = 2.6 * opts.fontScale;
  primitives.push({ type: "text", role: "dim", xMm: X(iwCm / 2), yMm: Y(0) - 2, text: `${iwCm * 10}`, sizeMm: dimSize, align: "C" });
  primitives.push({ type: "text", role: "dim", xMm: X(0) - 2, yMm: Y(ilCm / 2), text: `${ilCm * 10}`, sizeMm: dimSize, align: "R" });
  primitives.push({ type: "text", role: "stamp", xMm: opts.page.wMm - opts.marginMm, yMm: opts.marginMm + 3, text: `SCALE 1:${scale.ratio}`, sizeMm: 3 * opts.fontScale, align: "R" });
  primitives.push({ type: "text", role: "name", xMm: opts.marginMm, yMm: opts.marginMm + 3, text: room.name, sizeMm: 3.4 * opts.fontScale, align: "L" });

  return { primitives, scale, widthMm: opts.page.wMm, heightMm: opts.page.hMm };
}
