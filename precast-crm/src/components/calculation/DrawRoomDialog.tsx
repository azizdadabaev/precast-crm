"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { RoomCanvas } from "@/components/cad/RoomCanvas";
import {
  type Pt,
  type BeamDir,
  decomposeToBays,
  defaultBeamDir,
  bayToSlabInput,
  beamLayout,
  formatLengthCm,
  bbox,
} from "@/lib/cad/geometry";
import {
  isRectilinear,
  scanBeams,
  scanBeamsToOverlay,
  beamSchedule,
  blockEstimate,
} from "@/lib/cad/beam-scan";
import { calculateSlab } from "@/services/calculation-engine";
import {
  baysToSlabRows,
  scanScheduleToSlabRows,
} from "@/components/calculation/draw-rooms";
import type { SlabRow } from "@/components/calculation/MultiRoomCalculator";
import { Bi, useT } from "@/lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Number of existing calculator rows, so new room labels continue (startSeq+1…). */
  startSeq: number;
  /** Finalized calculator rows (already priced) → appended to the calculator. */
  onAddRooms: (rows: SlabRow[]) => void;
}

/**
 * Draw-a-room modal — HYBRID, mirroring the cad-test page.
 *
 * A drawn outline takes one of two paths:
 *  - RECTILINEAR (every wall H/V): the proven `decompose → bay → calculateSlab`
 *    path. Bays overlay the canvas with the engine-driven beam/block picture;
 *    confirming appends one exact calculator row per bay (`baysToSlabRows`).
 *  - TAPERED / IRREGULAR (any angled wall): the bay decomposer can't represent
 *    it, so we run the scanline beam engine (`scanBeams`), which casts beams at
 *    the pitch and follows the room's true width at each position. We show the
 *    beam count / length RANGE / cut-list / est. blocks, draw the tapering beams
 *    via `scanBeamsToOverlay`, and on confirm append one ESTIMATE row per
 *    beam-length bucket (`scanScheduleToSlabRows`).
 */
export function DrawRoomDialog({ open, onClose, startSeq, onAddRooms }: Props) {
  const t = useT();
  const [points, setPoints] = useState<Pt[]>([]);
  // Per-bay beam-direction overrides, keyed by bay index (absent → default).
  const [dirOverrides, setDirOverrides] = useState<Record<number, BeamDir>>({});

  // HYBRID ROUTING. A closed outline with ANY angled edge → scanline; every edge
  // H/V → the exact bay path. <4 points (still drawing) is treated as rectilinear.
  const rectilinear = useMemo(
    () => (points.length >= 4 ? isRectilinear(points) : true),
    [points],
  );

  const bays = useMemo(
    () => (points.length >= 4 && rectilinear ? decomposeToBays(points) : []),
    [points, rectilinear],
  );

  // Scanline result for an angled outline. Beams run across the SHORTER bbox
  // dimension by default (same heuristic as `defaultBeamDir`).
  const scan = useMemo(() => {
    if (points.length < 4 || rectilinear) return null;
    const box = bbox(points);
    const beamDir: BeamDir = box.w <= box.h ? "H" : "V";
    const { beams } = scanBeams(points, beamDir);
    const schedule = beamSchedule(beams);
    const blocks = blockEstimate(beams);
    const lengths = beams.map((b) => b.lengthCm);
    return {
      beamDir,
      beams,
      schedule,
      blocks,
      minLenCm: lengths.length ? Math.min(...lengths) : 0,
      maxLenCm: lengths.length ? Math.max(...lengths) : 0,
    };
  }, [points, rectilinear]);

  // Per-bay: resolved direction + engine result (rectilinear path only).
  const rows = useMemo(
    () =>
      bays.map((rect, i) => {
        const beamDir = dirOverrides[i] ?? defaultBeamDir(rect);
        let result = null;
        try {
          result = calculateSlab(bayToSlabInput({ rect, beamDir }));
        } catch {
          result = null;
        }
        return { rect, beamDir, result };
      }),
    [bays, dirOverrides],
  );

  const beamLayers = useMemo(
    () =>
      rows.map((r) =>
        r.result
          ? beamLayout(
              { rect: r.rect, beamDir: r.beamDir },
              r.result.beam_count,
              r.result.block_rows,
              r.result.blocks_per_row,
              Math.round(r.result.beam_length * 100),
              r.result.pattern,
            )
          : { beams: [], blockCells: [] },
      ),
    [rows],
  );

  // Tapered/angled overlay: turn the scanline beams into the SAME beam/block Rect
  // overlay the rectilinear path feeds RoomCanvas, so the angled drawing renders
  // its (tapering) beams instead of one wrong uniform bay.
  const scanOverlay = useMemo(
    () => (scan ? scanBeamsToOverlay({ beams: scan.beams }, scan.beamDir) : null),
    [scan],
  );

  const reset = () => {
    setPoints([]);
    setDirOverrides({});
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const setDir = (i: number, dir: BeamDir) =>
    setDirOverrides((prev) => ({ ...prev, [i]: dir }));

  const canAdd = rectilinear ? rows.length > 0 : !!scan && scan.beams.length > 0;

  const handleAdd = () => {
    let next: SlabRow[];
    if (rectilinear) {
      if (!rows.length) return;
      // Exact path: one priced calculator row per bay.
      next = baysToSlabRows(
        rows.map((r) => ({ rect: r.rect, beamDir: r.beamDir })),
        startSeq,
      );
    } else {
      if (!scan || !scan.beams.length) return;
      // Estimate path: one row per beam-length bucket from the cut-list.
      next = scanScheduleToSlabRows(scan.schedule, startSeq);
    }
    if (!next.length) return;
    onAddRooms(next);
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-[1400px] flex-col gap-3 sm:max-w-[1400px]">
        <DialogHeader>
          <DialogTitle>
            <Bi uz="Хона чизиш" en="Draw room" />
          </DialogTitle>
          <DialogDescription>
            {t(
              "Хона контурини чизинг — тўғри тўртбурчак хоналар аниқ ҳисобланади; қийшиқ деворли хоналар скан-усулда тахминий ҳисобланади.",
              "Sketch the room outline — rectangular rooms compute exactly; rooms with angled walls are estimated via the scanline engine.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 items-start justify-center overflow-auto">
            <RoomCanvas
              points={points}
              onChange={setPoints}
              bays={bays}
              beamLayers={scanOverlay ? [scanOverlay] : beamLayers}
              svgClassName="h-[62vh] w-auto max-w-full"
            />
          </div>

          <div className="w-full space-y-2 overflow-y-auto lg:w-72 lg:shrink-0">
            <div className="text-sm text-muted-foreground">
              {scan
                ? t(
                    `Қийшиқ хона — ${scan.beams.length} балка (скан)`,
                    `Tapered / irregular — ${scan.beams.length} beams (scanline)`,
                  )
                : bays.length
                  ? t(`${bays.length} та хона`, `${bays.length} bay${bays.length > 1 ? "s" : ""}`)
                  : t("Ёпиқ хона чизинг (≥4 нуқта)", "Draw a closed room (≥4 points)")}
            </div>

            {/* Tapered / irregular: scanline summary + cut-list (mirrors cad-test). */}
            {scan && (
              <div className="rounded border-2 border-amber-300 bg-amber-50/40 p-2 text-xs">
                <div className="mb-1 font-semibold text-amber-800">
                  {t("Қийшиқ / нотўғри хона", "Tapered / irregular room")}
                </div>
                <div className="mb-2 text-[11px] text-amber-700">
                  {t(
                    "Қийшиқ деворлар туфайли балка узунликлари ўзгаради. Аниқ тўртбурчак ҳисоб мос келмайди; қуйидаги қийматлар скан-усулдан (балка узунлиги = очиқ оралиқ + 2 × таянч).",
                    "Angled walls → beam lengths vary. The exact rectangular engine doesn't apply; values below come from the scanline engine (beam length = clear span + 2 × bearing).",
                  )}
                </div>
                <table className="w-full tabular-nums">
                  <tbody className="[&_td]:py-0.5 [&_td:first-child]:text-muted-foreground">
                    <tr>
                      <td>{t("Йўналиш", "Beam dir")}</td>
                      <td className="text-right">{scan.beamDir}</td>
                    </tr>
                    <tr>
                      <td>{t("Балка сони", "Beam count")}</td>
                      <td className="text-right">{scan.beams.length}</td>
                    </tr>
                    <tr>
                      <td>{t("Узунлик оралиғи", "Length range")}</td>
                      <td className="text-right">
                        {formatLengthCm(scan.minLenCm)} – {formatLengthCm(scan.maxLenCm)}
                      </td>
                    </tr>
                    <tr>
                      <td>{t("Ғишт (тахм.)", "Est. blocks")}</td>
                      <td className="text-right">{scan.blocks.totalBlocks}</td>
                    </tr>
                  </tbody>
                </table>

                {scan.schedule.length > 0 && (
                  <div className="mt-2 border-t border-amber-200 pt-1.5">
                    <div className="mb-1 text-[11px] font-semibold text-muted-foreground">
                      {t("БАЛКА КЕСИШ РЎЙХАТИ", "BEAM CUT-LIST")}
                    </div>
                    <table className="w-full tabular-nums text-[11px]">
                      <thead>
                        <tr className="text-muted-foreground">
                          <td>{t("Узунлик", "Length")}</td>
                          <td className="text-right">{t("Сони", "Qty")}</td>
                        </tr>
                      </thead>
                      <tbody className="[&_td]:py-0.5">
                        {scan.schedule.map((e) => (
                          <tr key={e.lengthCm}>
                            <td className="text-muted-foreground">{formatLengthCm(e.lengthCm)}</td>
                            <td className="text-right font-medium">{e.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-1.5 text-[10px] text-muted-foreground">
                      {t(
                        "«Қўшиш» ҳар бир узунлик гуруҳи учун битта тахминий «(tapered)» хона қўшади.",
                        "“Add” appends one estimate “(tapered)” room per length group.",
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Rectilinear: per-bay summary + direction toggle (unchanged). */}
            {rows.map((r, i) => (
              <div key={i} className="rounded border p-2 text-xs">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {t(`Хона ${i + 1}`, `Bay ${i + 1}`)} —{" "}
                    {(r.rect.w / 100).toFixed(2)}×{(r.rect.h / 100).toFixed(2)} m
                  </span>
                  <span className="inline-flex overflow-hidden rounded border">
                    {(["H", "V"] as BeamDir[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDir(i, d)}
                        className={
                          "px-2 py-0.5 " +
                          (r.beamDir === d ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground")
                        }
                      >
                        {d}
                      </button>
                    ))}
                  </span>
                </div>
                {r.result && (
                  <div className="tabular-nums text-muted-foreground">
                    {t("Балка", "Beams")}: {r.result.beam_count} · {t("Ғишт", "Blocks")}: {r.result.total_blocks}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t pt-3">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            <Bi uz="Бекор қилиш" en="Cancel" />
          </Button>
          <Button size="sm" disabled={!canAdd} onClick={handleAdd}>
            <Bi uz="Хоналарни қўшиш" en="Add rooms" enClassName="font-normal opacity-90" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
