import { calculateSlab } from "@/services/calculation-engine";
import { buildRoomPlan } from "@/lib/cad/sheet/sheet-plan";
import { DEFAULT_SHEET_OPTIONS } from "@/lib/cad/sheet/sheet-scale";
import { SheetSvg } from "@/lib/cad/sheet/SheetSvg";

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

export default function PrintSheetPage({ searchParams }: { searchParams: { payload?: string } }) {
  const rooms = decodeRooms(searchParams.payload);
  if (!rooms || rooms.length === 0) {
    return <div style={{ padding: 24, fontFamily: "sans-serif" }}>No rooms to render.</div>;
  }
  const r = rooms[0];
  const calc = calculateSlab({ inner_width: Number(r.inner_width), inner_length: Number(r.inner_length) });
  const plan = buildRoomPlan({ name: r.name || "Xona", calc, beamDir: r.beamDir }, DEFAULT_SHEET_OPTIONS);
  return (
    <>
      <style>{`@page { size: A4 landscape; margin: 0 } html,body{margin:0;padding:0;background:#fff}`}</style>
      <SheetSvg widthMm={plan.widthMm} heightMm={plan.heightMm} primitives={plan.primitives} />
    </>
  );
}
