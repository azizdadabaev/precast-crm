import { calculateSlab } from "@/services/calculation-engine";
import { buildRoomPlan, type SheetRegion } from "@/lib/cad/sheet/sheet-plan";
import { buildBomBlock } from "@/lib/cad/sheet/sheet-bom";
import { DEFAULT_SHEET_OPTIONS, usableSheetMm } from "@/lib/cad/sheet/sheet-scale";
import { SheetSvg } from "@/lib/cad/sheet/SheetSvg";
import { SHEET_PRINT_TOKEN } from "@/lib/cad/sheet/print-token";

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
  const r = rooms[0];
  const opts = DEFAULT_SHEET_OPTIONS;
  const calc = calculateSlab({ inner_width: Number(r.inner_width), inner_length: Number(r.inner_length) });
  const name = r.name || "Xona";

  // Split the usable area: drawing on top (~58%), BoM below (~40%), small gap.
  const usable = usableSheetMm(opts.page, opts.marginMm);
  const gapMm = 4;
  const drawHMm = usable.hMm * 0.58;
  const bomHMm = usable.hMm * 0.40;
  const drawingRegion: SheetRegion = { xMm: opts.marginMm, yMm: opts.marginMm, wMm: usable.wMm, hMm: drawHMm };
  const bomRegion: SheetRegion = { xMm: opts.marginMm, yMm: opts.marginMm + drawHMm + gapMm, wMm: usable.wMm, hMm: bomHMm };

  const plan = buildRoomPlan({ name, calc, beamDir: r.beamDir }, opts, drawingRegion);
  const bom = buildBomBlock([{ name, calc }], bomRegion, opts);
  const primitives = [...plan.primitives, ...bom];
  return (
    <>
      <style>{`@page { size: A4 landscape; margin: 0 } html,body{margin:0;padding:0;background:#fff}`}</style>
      <SheetSvg widthMm={plan.widthMm} heightMm={plan.heightMm} primitives={primitives} />
    </>
  );
}
