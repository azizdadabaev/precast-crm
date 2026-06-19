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
} from "@/lib/cad/geometry";
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

const fmt = (n: number) => n.toLocaleString("en-US");

export default function CadTestPage() {
  const [points, setPoints] = useState<Pt[]>([]);
  // Per-bay beam-direction overrides, keyed by bay index. Absent → use default.
  const [dirOverrides, setDirOverrides] = useState<Record<number, BeamDir>>({});

  // Re-decompose whenever the outline changes. Overrides are keyed by index;
  // resetting the shape clears them via "Clear" / "Load example".
  const bays = useMemo(
    () => (points.length >= 4 ? decomposeToBays(points) : []),
    [points],
  );

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

  const setDir = (i: number, dir: BeamDir) =>
    setDirOverrides((prev) => ({ ...prev, [i]: dir }));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">CAD Room Layout (test)</h1>
        <Button type="button" variant="outline" size="sm" onClick={loadExample}>
          Load L-shape example
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: drawing surface */}
        <div>
          <RoomCanvas points={points} onChange={setPoints} bays={bays} />
        </div>

        {/* Right: results */}
        <div className="space-y-4">
          <div className="text-sm text-slate-600">
            {bays.length
              ? `${bays.length} bay${bays.length > 1 ? "s" : ""} decomposed`
              : "Draw a closed room (≥4 points) to see bays."}
          </div>

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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
