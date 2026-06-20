import { calculateSlab, type SlabResult } from "@/services/calculation-engine";
import { buildRoomPlanScaled, type SheetRegion, type PlanPrimitive } from "@/lib/cad/sheet/sheet-plan";
import { buildBomBlock } from "@/lib/cad/sheet/sheet-bom";
import { packRooms } from "@/lib/cad/sheet/sheet-pack";
import { DEFAULT_SHEET_OPTIONS, usableSheetMm } from "@/lib/cad/sheet/sheet-scale";
import { SheetSvg } from "@/lib/cad/sheet/SheetSvg";
import { SHEET_PRINT_TOKEN } from "@/lib/cad/sheet/print-token";
import { buildHeaderBand, HEADER_H_MM } from "@/lib/cad/sheet/sheet-header";

export const dynamic = "force-dynamic";

interface RawRoom { name?: string; inner_width: number; inner_length: number; beamDir?: "H" | "V"; }

function decodeRooms(payload: string | undefined): RawRoom[] | null {
  if (!payload) return null;
  try {
    const json = Buffer.from(payload, "base64").toString("utf8");
    const parsed = JSON.parse(json) as { rooms?: RawRoom[] };
    return Array.isArray(parsed?.rooms) ? parsed.rooms : null;
  } catch {
    return null;
  }
}

export default function PrintSheetPage({ searchParams }: { searchParams: { payload?: string; k?: string } }) {
  if (searchParams.k !== SHEET_PRINT_TOKEN) return <div>Forbidden</div>;
  const rooms = decodeRooms(searchParams.payload);
  if (!rooms || rooms.length === 0) {
    return <div style={{ padding: 24, fontFamily: "sans-serif" }}>No rooms to render.</div>;
  }
  const opts = DEFAULT_SHEET_OPTIONS;
  const sized = rooms.map((r, i): { name: string; calc: SlabResult; beamDir?: "H" | "V" } => ({
    name: r.name || `Xona ${i + 1}`,
    calc: calculateSlab({ inner_width: Number(r.inner_width), inner_length: Number(r.inner_length) }),
    beamDir: r.beamDir,
  }));

  // Split the usable area: header at top (HEADER_H_MM), then drawing (~55%), then BoM (~43%).
  const usable = usableSheetMm(opts.page, opts.marginMm);
  const gapMm = 4;
  const remainingHMm = usable.hMm - HEADER_H_MM;
  const drawHMm = remainingHMm * 0.55;
  const bomHMm = remainingHMm * 0.43;
  const drawingTopY = opts.marginMm + HEADER_H_MM;
  const drawingRegion: SheetRegion = { xMm: opts.marginMm, yMm: drawingTopY, wMm: usable.wMm, hMm: drawHMm };
  const bomRegion: SheetRegion = { xMm: opts.marginMm, yMm: drawingTopY + drawHMm + gapMm, wMm: usable.wMm, hMm: bomHMm };

  // All rooms drawn at ONE shared scale, shelf-packed into the drawing region.
  const pack = packRooms(sized, drawingRegion, opts);
  const roomPrimitives: PlanPrimitive[] = [];
  for (const p of pack.placements) {
    const { primitives } = buildRoomPlanScaled(p, opts, pack.mmPerCm, p.offXMm, p.offYMm);
    roomPrimitives.push(...primitives);
  }

  const header = buildHeaderBand(opts);
  const bom = buildBomBlock(sized.map((s) => ({ name: s.name, calc: s.calc })), bomRegion, opts);
  // One shared scale stamp at the top-right of the drawing region.
  const stamp: PlanPrimitive = {
    type: "text", role: "stamp",
    xMm: opts.page.wMm - opts.marginMm, yMm: drawingTopY + 3,
    text: `Миқёс 1:${pack.ratio}`, sizeMm: 3 * opts.fontScale, align: "R",
  };
  const primitives = [...header, ...roomPrimitives, stamp, ...bom];
  return (
    <>
      <style>{`@page { size: A4 landscape; margin: 0 } html,body{margin:0;padding:0;background:#fff}`}</style>
      <SheetSvg widthMm={opts.page.wMm} heightMm={opts.page.hMm} primitives={primitives} />
    </>
  );
}
