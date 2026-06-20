"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { RoomCanvas } from "@/components/cad/RoomCanvas";
import {
  type Pt,
  type BeamDir,
  decomposeToBays,
  defaultBeamDir,
  bayToSlabInput,
  beamLayout,
  mergeBeamScheduleByKind,
  formatLengthCm,
  bbox,
  BEARING_CM,
} from "@/lib/cad/geometry";
import {
  isRectilinear,
  scanBeams,
  beamSchedule,
  blockEstimate,
} from "@/lib/cad/beam-scan";
import { calculateSlab, type SlabResult } from "@/services/calculation-engine";

const L_SHAPE: Pt[] = [
  { x: 0, y: 0 },
  { x: 340, y: 0 },
  { x: 340, y: 622 },
  { x: 0, y: 622 },
  { x: 0, y: 404 },
  { x: 100, y: 404 },
  { x: 100, y: 0 },
];

// Chamfered pentagon: 3.20 m wide at the top tapering via chamfers to 1.60 m at
// the bottom, 5.00 m tall. An ANGLED outline → routes through the scanline
// engine, which yields beams whose length shrinks from the wide end to the
// narrow end (instead of the old single wrong 1.6×5.0 bay).
const CHAMFER: Pt[] = [
  { x: 0, y: 0 },
  { x: 320, y: 0 },
  { x: 240, y: 500 },
  { x: 80, y: 500 },
];

const fmt = (n: number) => n.toLocaleString("en-US");

export default function CadTestPage() {
  const [points, setPoints] = useState<Pt[]>([]);
  // Per-bay beam-direction overrides, keyed by bay index. Absent → use default.
  const [dirOverrides, setDirOverrides] = useState<Record<number, BeamDir>>({});

  // HYBRID ROUTING. A drawn outline takes one of two paths:
  //  - RECTILINEAR (every edge H/V): keep the proven decompose → bay →
  //    calculateSlab path so the engine numbers (and the golden test) are exact.
  //  - ANGLED (any diagonal edge, e.g. a chamfer/taper): the bay decomposer
  //    can't represent it, so use the scanline beam engine, which casts beams at
  //    the pitch and follows the room's true width at each position.
  const rectilinear = useMemo(
    () => (points.length >= 4 ? isRectilinear(points) : true),
    [points],
  );

  // Re-decompose whenever the outline changes. Overrides are keyed by index;
  // resetting the shape clears them via "Clear" / "Load example". Only the
  // rectilinear path uses bays.
  const bays = useMemo(
    () =>
      points.length >= 4 && rectilinear ? decomposeToBays(points) : [],
    [points, rectilinear],
  );

  // Scanline result for an angled outline. Beams run across the SHORTER bbox
  // dimension by default (same heuristic as `defaultBeamDir`): a wider-than-tall
  // room runs beams vertically, else horizontally.
  const scan = useMemo(() => {
    if (points.length < 4 || rectilinear) return null;
    const box = bbox(points);
    const beamDir: BeamDir = box.w <= box.h ? "H" : "V";
    const { beams } = scanBeams(points, beamDir);
    const sched = beamSchedule(beams);
    const blocks = blockEstimate(beams);
    const lengths = beams.map((b) => b.lengthCm);
    return {
      beamDir,
      beams,
      schedule: sched,
      blocks,
      minLenCm: lengths.length ? Math.min(...lengths) : 0,
      maxLenCm: lengths.length ? Math.max(...lengths) : 0,
    };
  }, [points, rectilinear]);

  const rows = useMemo(() => {
    return bays.map((rect, i) => {
      const beamDir = dirOverrides[i] ?? defaultBeamDir(rect);
      let result: SlabResult | null = null;
      let error: string | null = null;
      try {
        result = calculateSlab(bayToSlabInput({ rect, beamDir }));
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      return { rect, beamDir, result, error };
    });
  }, [bays, dirOverrides]);

  // Per-bay beam/block overlay, index-aligned with `bays`. Driven by the
  // engine's counts so the picture matches the numbers; empty layers for
  // bays the engine couldn't compute. Now PITCH-accurate and fed the real
  // beam_length (cm) + blocks_per_row so the drawing == the schedule.
  const beamLayers = useMemo(
    () =>
      rows.map((r) =>
        beamLayout(
          { rect: r.rect, beamDir: r.beamDir },
          r.result?.beam_count ?? 0,
          r.result?.block_rows ?? 0,
          r.result?.blocks_per_row ?? 0,
          r.result ? Math.round(r.result.beam_length * 100) : 0,
          r.result?.pattern ?? "GB",
          BEARING_CM,
        ),
      ),
    [rows],
  );

  // Project-wide beam schedule (counts grouped by beam length AND kind), summed
  // across bays — the factory cut-list, split structural vs manual-extra. Drawn
  // from the SAME layers the overlay uses, so the numbers match the picture.
  const schedule = useMemo(
    () => mergeBeamScheduleByKind(beamLayers.map((l) => l.schedule)),
    [beamLayers],
  );

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        if (!r.result) return acc;
        acc.beam_count += r.result.beam_count;
        acc.total_blocks += r.result.total_blocks;
        acc.monolith_area += r.result.monolith_area;
        acc.subtotal += r.result.subtotal;
        return acc;
      },
      { beam_count: 0, total_blocks: 0, monolith_area: 0, subtotal: 0 },
    );
  }, [rows]);

  const loadExample = () => {
    setDirOverrides({});
    setPoints(L_SHAPE);
  };

  const loadChamfer = () => {
    setDirOverrides({});
    setPoints(CHAMFER);
  };

  const setDir = (i: number, dir: BeamDir) =>
    setDirOverrides((prev) => ({ ...prev, [i]: dir }));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">CAD Room Layout (test)</h1>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={loadExample}>
            Load L-shape example
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={loadChamfer}>
            Load chamfer (tapered)
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: drawing surface */}
        <div>
          <RoomCanvas points={points} onChange={setPoints} bays={bays} beamLayers={beamLayers} />
        </div>

        {/* Right: results */}
        <div className="space-y-4">
          <div className="text-sm text-slate-600">
            {scan
              ? `Tapered / irregular layout — ${scan.beams.length} beams cast at pitch (scanline engine)`
              : bays.length
                ? `${bays.length} bay${bays.length > 1 ? "s" : ""} decomposed`
                : "Draw a closed room (≥4 points) to see bays."}
          </div>

          {scan && (
            <div className="rounded border-2 border-amber-300 bg-amber-50/40 p-3 text-sm">
              <div className="mb-1 font-semibold text-amber-800">
                Tapered / irregular room
              </div>
              <div className="mb-2 text-xs text-amber-700">
                This outline has angled walls, so beam lengths vary across the
                room. The exact rectangular engine doesn&apos;t apply; lengths
                below come from the scanline beam engine (beam length = clear
                span + 2 × bearing).
              </div>
              <table className="w-full">
                <tbody className="[&_td]:py-0.5 [&_td:first-child]:text-slate-500">
                  <tr>
                    <td>Beam direction</td>
                    <td className="text-right">{scan.beamDir}</td>
                  </tr>
                  <tr>
                    <td>Beam count</td>
                    <td className="text-right">{scan.beams.length}</td>
                  </tr>
                  <tr>
                    <td>Beam length range</td>
                    <td className="text-right">
                      {formatLengthCm(scan.minLenCm)} – {formatLengthCm(scan.maxLenCm)}
                    </td>
                  </tr>
                  <tr>
                    <td>Est. blocks</td>
                    <td className="text-right">{scan.blocks.totalBlocks}</td>
                  </tr>
                </tbody>
              </table>

              {scan.schedule.length > 0 && (
                <div className="mt-3 border-t border-amber-200 pt-2">
                  <div className="mb-1 text-xs font-semibold text-slate-500">
                    BEAM CUT-LIST (rounded to 5 cm stock)
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400">
                        <td>Length</td>
                        <td className="text-right">Qty</td>
                      </tr>
                    </thead>
                    <tbody className="[&_td]:py-0.5">
                      {scan.schedule.map((e) => (
                        <tr key={e.lengthCm}>
                          <td className="text-slate-600">{formatLengthCm(e.lengthCm)}</td>
                          <td className="text-right font-medium">{e.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-2 text-[11px] text-slate-400">
                    Block estimate assumes one ⌈span / 20 cm⌉ row between adjacent
                    beams; bearing 15 cm per end.
                  </div>
                </div>
              )}
            </div>
          )}

          {rows.map((r, i) => (
            <div key={i} className="rounded border p-3 text-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium">
                  Bay {i + 1} — {(r.rect.w / 100).toFixed(2)} × {(r.rect.h / 100).toFixed(2)} m
                </span>
                <span className="inline-flex overflow-hidden rounded border">
                  {(["H", "V"] as BeamDir[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDir(i, d)}
                      className={
                        "px-2 py-0.5 text-xs " +
                        (r.beamDir === d
                          ? "bg-sky-600 text-white"
                          : "bg-white text-slate-600")
                      }
                    >
                      {d}
                    </button>
                  ))}
                </span>
              </div>

              {r.error ? (
                <div className="text-red-600">Error: {r.error}</div>
              ) : r.result ? (
                <table className="w-full">
                  <tbody className="[&_td]:py-0.5 [&_td:first-child]:text-slate-500">
                    <tr>
                      <td>Beam length</td>
                      <td className="text-right">{r.result.beam_length} m</td>
                    </tr>
                    <tr>
                      <td>Beam count</td>
                      <td className="text-right">{r.result.beam_count}</td>
                    </tr>
                    <tr>
                      <td>Total blocks</td>
                      <td className="text-right">{r.result.total_blocks}</td>
                    </tr>
                    <tr>
                      <td>Pattern</td>
                      <td className="text-right">{r.result.pattern}</td>
                    </tr>
                    <tr>
                      <td>Monolith area</td>
                      <td className="text-right">{r.result.monolith_area} m²</td>
                    </tr>
                    <tr>
                      <td>Subtotal</td>
                      <td className="text-right">{fmt(r.result.subtotal)} UZS</td>
                    </tr>
                  </tbody>
                </table>
              ) : null}
            </div>
          ))}

          {rows.length > 0 && (
            <div className="rounded border-2 border-slate-300 p-3 text-sm">
              <div className="mb-2 font-semibold">TOTALS</div>
              <table className="w-full">
                <tbody className="[&_td]:py-0.5 [&_td:first-child]:text-slate-500">
                  <tr>
                    <td>Beam count</td>
                    <td className="text-right font-medium">{totals.beam_count}</td>
                  </tr>
                  <tr>
                    <td>Total blocks</td>
                    <td className="text-right font-medium">{totals.total_blocks}</td>
                  </tr>
                  <tr>
                    <td>Monolith area</td>
                    <td className="text-right font-medium">
                      {totals.monolith_area.toFixed(2)} m²
                    </td>
                  </tr>
                  <tr>
                    <td>Subtotal</td>
                    <td className="text-right font-medium">{fmt(Math.round(totals.subtotal))} UZS</td>
                  </tr>
                </tbody>
              </table>

              {schedule.length > 0 && (
                <div className="mt-3 border-t pt-2">
                  <div className="mb-1 text-xs font-semibold text-slate-500">
                    BEAM SCHEDULE (cut-list)
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-slate-400">
                        <td>Length</td>
                        <td>Type</td>
                        <td className="text-right">Qty</td>
                      </tr>
                    </thead>
                    <tbody className="[&_td]:py-0.5">
                      {schedule.map((e) => (
                        <tr key={`${e.lengthCm}-${e.kind}`}>
                          <td className="text-slate-600">{formatLengthCm(e.lengthCm)}</td>
                          <td className={e.kind === "extra" ? "text-amber-600" : "text-slate-500"}>
                            {e.kind === "extra" ? "extra" : "main"}
                          </td>
                          <td className="text-right font-medium">{e.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
