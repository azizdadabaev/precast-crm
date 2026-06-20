import type { SlabResult } from "@/services/calculation-engine";
import type { BeamDir } from "@/lib/cad/geometry";
import { beamLayout, defaultBeamDir } from "@/lib/cad/geometry";
import { pickArchScaleForBox, usableSheetMm, type ArchScale, type SheetOptions } from "@/lib/cad/sheet/sheet-scale";

export interface RoomInput { name: string; calc: SlabResult; beamDir?: BeamDir; }

export type PlanPrimitive =
  | { type: "rect"; role: "outline" | "beam" | "bearing" | "block" | "bom"; xMm: number; yMm: number; wMm: number; hMm: number }
  | { type: "line"; role: "dim" | "witness" | "bom" | "pitch" | "header"; x1Mm: number; y1Mm: number; x2Mm: number; y2Mm: number }
  | { type: "text"; role: "dim" | "stamp" | "name" | "bom" | "beamnum" | "pitch"; xMm: number; yMm: number; text: string; sizeMm: number; align: "L" | "C" | "R"; angleDeg?: number };

export interface RoomPlan { primitives: PlanPrimitive[]; scale: ArchScale; widthMm: number; heightMm: number; }

/** A rectangular paper-space box (mm) the drawing is fitted/centered into. */
export interface SheetRegion { xMm: number; yMm: number; wMm: number; hMm: number; }

/** Lower-level builder: emit ALL of a room's primitives (outline, beams,
 *  bearings, beam numbers, pitch chain, the two outer dims, the room name) at a
 *  GIVEN mmPerCm and top-left paper-space offset — no internal scale pick, no
 *  centering. Used by both the single-room path (buildRoomPlan) and the
 *  multi-room shared-scale path (sheet-pack). Does NOT emit the scale stamp;
 *  the caller owns that (one shared stamp for the whole sheet). */
export function buildRoomPlanScaled(
  room: RoomInput,
  opts: SheetOptions,
  mmPerCm: number,
  offXMm: number,
  offYMm: number,
): { primitives: PlanPrimitive[]; drawnWMm: number; drawnHMm: number } {
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

  const offX = offXMm;
  const offY = offYMm;
  const X = (cm: number) => offX + cm * mmPerCm;
  const Y = (cm: number) => offY + cm * mmPerCm;
  const S = (cm: number) => cm * mmPerCm;

  const primitives: PlanPrimitive[] = [];
  primitives.push({ type: "rect", role: "outline", xMm: X(0), yMm: Y(0), wMm: S(iwCm), hMm: S(ilCm) });
  // Beam rects in paper space (mm); keep them so the labels + pitch chain derive
  // their geometry from the SAME rects the renderer draws (single source).
  const beamRects = layout.beams.map((b) => ({ xMm: X(b.x), yMm: Y(b.y), wMm: S(b.w), hMm: S(b.h) }));
  for (const r of beamRects) primitives.push({ type: "rect", role: "beam", xMm: r.xMm, yMm: r.yMm, wMm: r.wMm, hMm: r.hMm });
  for (const b of layout.bearings) primitives.push({ type: "rect", role: "bearing", xMm: X(b.x), yMm: Y(b.y), wMm: S(b.w), hMm: S(b.h) });

  // Beam numbers B1..Bn, centred on each beam rect. For "V" beams the strip is
  // tall+narrow, so rotate the label −90° to run along it.
  const isV = beamDir === "V";
  const beamNumSize = 2.0 * opts.fontScale;
  const MIN_LABEL_MM = 1.5; // skip a label if the strip's short side is mush
  beamRects.forEach((r, i) => {
    const shortMm = Math.min(r.wMm, r.hMm);
    if (shortMm < MIN_LABEL_MM) return;
    primitives.push({
      type: "text", role: "beamnum",
      xMm: r.xMm + r.wMm / 2, yMm: r.yMm + r.hMm / 2,
      text: `B${i + 1}`, sizeMm: beamNumSize, align: "C",
      ...(isV ? { angleDeg: -90 } : {}),
    });
  });

  // Pitch chain: prove the 58 cm module along the SPACING axis (perpendicular to
  // the beams), just outside the outline. Centres come from the beam rects.
  if (beamRects.length >= 1) {
    const pitchSize = 2.2 * opts.fontScale;
    const tickMm = 2.5; // tick half-length off the chain line
    if (!isV) {
      // "H" beams: spaced along y → vertical chain to the left of the plan.
      const centresY = beamRects.map((r) => r.yMm + r.hMm / 2).sort((a, b) => a - b);
      // Park the chain just left of the outline; if that overflows the page, put
      // it just inside the left wall instead.
      const outLeft = X(0);
      let chainX = outLeft - 6;
      if (chainX - tickMm < 0) chainX = outLeft + 6;
      for (const cy of centresY) {
        primitives.push({ type: "line", role: "pitch", x1Mm: chainX - tickMm, y1Mm: cy, x2Mm: chainX + tickMm, y2Mm: cy });
      }
      for (let i = 0; i + 1 < centresY.length; i++) {
        const spacing = centresY[i + 1] - centresY[i];
        const midY = (centresY[i] + centresY[i + 1]) / 2;
        primitives.push({
          type: "text", role: "pitch",
          xMm: chainX, yMm: midY,
          text: `${Math.round(spacing / mmPerCm * 10)}`,
          sizeMm: pitchSize, align: "C", angleDeg: -90,
        });
      }
    } else {
      // "V" beams: spaced along x → horizontal chain below the plan.
      const centresX = beamRects.map((r) => r.xMm + r.wMm / 2).sort((a, b) => a - b);
      const outBottom = Y(ilCm);
      let chainY = outBottom + 6;
      if (chainY + tickMm > opts.page.hMm) chainY = outBottom - 6;
      for (const cx of centresX) {
        primitives.push({ type: "line", role: "pitch", x1Mm: cx, y1Mm: chainY - tickMm, x2Mm: cx, y2Mm: chainY + tickMm });
      }
      for (let i = 0; i + 1 < centresX.length; i++) {
        const spacing = centresX[i + 1] - centresX[i];
        const midX = (centresX[i] + centresX[i + 1]) / 2;
        primitives.push({
          type: "text", role: "pitch",
          xMm: midX, yMm: chainY,
          text: `${Math.round(spacing / mmPerCm * 10)}`,
          sizeMm: pitchSize, align: "C",
        });
      }
    }
  }
  const dimSize = 2.6 * opts.fontScale;
  primitives.push({ type: "text", role: "dim", xMm: X(iwCm / 2), yMm: Y(0) - 2, text: `${iwCm * 10}`, sizeMm: dimSize, align: "C" });
  primitives.push({ type: "text", role: "dim", xMm: X(0) - 2, yMm: Y(ilCm / 2), text: `${ilCm * 10}`, sizeMm: dimSize, align: "R" });
  // Room name, anchored just above-left of the room's own outline so it travels
  // with the room in the multi-room (shared-scale) layout.
  primitives.push({ type: "text", role: "name", xMm: X(0), yMm: Y(0) - 5, text: room.name, sizeMm: 3.0 * opts.fontScale, align: "L" });

  return { primitives, drawnWMm: S(iwCm), drawnHMm: S(ilCm) };
}

export function buildRoomPlan(room: RoomInput, opts: SheetOptions, region?: SheetRegion): RoomPlan {
  const iwCm = Math.round(room.calc.inner_width * 100);
  const ilCm = Math.round(room.calc.inner_length * 100);

  const usable = usableSheetMm(opts.page, opts.marginMm);
  const reg: SheetRegion = region ?? { xMm: opts.marginMm, yMm: opts.marginMm, wMm: usable.wMm, hMm: usable.hMm };
  const scale = pickArchScaleForBox(iwCm, ilCm, reg.wMm, reg.hMm);
  const offX = reg.xMm + (reg.wMm - scale.drawWMm) / 2;
  const offY = reg.yMm + (reg.hMm - scale.drawHMm) / 2;

  const { primitives } = buildRoomPlanScaled(room, opts, scale.mmPerCm, offX, offY);
  // Single shared scale stamp, top-right of the region.
  primitives.push({ type: "text", role: "stamp", xMm: opts.page.wMm - opts.marginMm, yMm: reg.yMm + 3, text: `Миқёс 1:${scale.ratio}`, sizeMm: 3 * opts.fontScale, align: "R" });

  return { primitives, scale, widthMm: opts.page.wMm, heightMm: opts.page.hMm };
}
