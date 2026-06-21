"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
  type RoomShape,
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
import { type CalculatorDrawing } from "@/store/calculator";
import { Bi, useT } from "@/lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Number of existing calculator rows, so new room labels continue (startSeq+1…). */
  startSeq: number;
  /** Finalized calculator rows (already priced) → appended to the calculator. */
  onAddRooms: (rows: SlabRow[]) => void;
  /** Persisted floor plan (from the calculator store), so the outlines survive
   *  closing the dialog or a refresh. null = nothing drawn yet. */
  drawing: CalculatorDrawing | null;
  /** Write the floor plan back to the store; null clears it. */
  onDrawingChange: (drawing: CalculatorDrawing | null) => void;
}

const EMPTY_DRAWING: CalculatorDrawing = { rooms: [], globalDir: null, dirOverrides: {} };
const EMPTY_ROOM: RoomShape = { points: [], closed: false };

/**
 * Draw-a-floor-plan modal — MULTI-ROOM.
 *
 * The canvas edits one ACTIVE room at a time (full CAD tools); the other rooms
 * render as a read-only backdrop and are clickable to edit. Each closed room
 * takes one of two paths:
 *  - RECTILINEAR (every wall H/V): the proven `decompose → bay → calculateSlab`
 *    path; one exact calculator row per bay (`baysToSlabRows`).
 *  - TAPERED / IRREGULAR (any angled wall): the scanline beam engine
 *    (`scanBeams`); one ESTIMATE row per beam-length bucket
 *    (`scanScheduleToSlabRows`).
 * "Add rooms" appends the priced rows for EVERY room, numbered continuously.
 */
export function DrawRoomDialog({
  open,
  onClose,
  startSeq,
  onAddRooms,
  drawing,
  onDrawingChange,
}: Props) {
  const t = useT();
  const dr = drawing ?? EMPTY_DRAWING;
  // Always present at least one (possibly empty) room so the canvas has an
  // active target to draw into.
  const rooms: RoomShape[] = dr.rooms.length ? dr.rooms : [EMPTY_ROOM];
  const globalDir = dr.globalDir;
  const dirOverrides = dr.dirOverrides;

  const [activeIndex, setActiveIndex] = useState(0);
  const safeActive = Math.min(Math.max(0, activeIndex), rooms.length - 1);
  const activeRoom = rooms[safeActive] ?? EMPTY_ROOM;
  const points = activeRoom.points;
  const activeClosed = activeRoom.closed;

  // ── Writers ──────────────────────────────────────────────────
  const writeDrawing = (next: CalculatorDrawing) => onDrawingChange(next);

  // Active room outline + closed (atomic) — feeds RoomCanvas.onActiveChange.
  const onActiveChange = (pts: Pt[], closed: boolean) => {
    const next = rooms.slice();
    next[safeActive] = { points: pts, closed };
    writeDrawing({ ...dr, rooms: next });
  };

  const setGlobalDir = (d: BeamDir | null) =>
    writeDrawing({ ...dr, rooms, globalDir: d });

  const setDir = (roomI: number, bayI: number, d: BeamDir) =>
    writeDrawing({
      ...dr,
      rooms,
      dirOverrides: { ...dirOverrides, [`${roomI}:${bayI}`]: d },
    });

  // Start a NEW room. Reuse the active slot if it's still empty (no litter),
  // else append + activate. A seed places the first point / a preset outline.
  const requestNewRoom = (seed?: RoomShape) => {
    const room = seed ?? { points: [], closed: false };
    const active = rooms[safeActive];
    if (active && active.points.length === 0) {
      const next = rooms.slice();
      next[safeActive] = room;
      writeDrawing({ ...dr, rooms: next });
    } else {
      const next = [...rooms, room];
      writeDrawing({ ...dr, rooms: next });
      setActiveIndex(next.length - 1);
    }
  };

  const deleteRoom = (i: number) => {
    const next = rooms.filter((_, k) => k !== i);
    writeDrawing({ ...dr, rooms: next.length ? next : [EMPTY_ROOM] });
    setActiveIndex((cur) => {
      const c = cur > i ? cur - 1 : cur;
      return Math.min(Math.max(0, c), Math.max(0, next.length - 1));
    });
  };

  // Backdrop = every room but the active one, with at least one point.
  const backgroundRooms = rooms
    .map((r, i) => ({ points: r.points, closed: r.closed, label: String(i + 1), index: i }))
    .filter((r) => r.index !== safeActive && r.points.length >= 1);

  // ── Active room derivations (interactive overlay) ─────────────
  const rectilinear = useMemo(
    () => (points.length >= 4 ? isRectilinear(points) : true),
    [points],
  );

  const bays = useMemo(
    () => (points.length >= 4 && rectilinear ? decomposeToBays(points) : []),
    [points, rectilinear],
  );

  const scan = useMemo(() => {
    if (points.length < 4 || rectilinear) return null;
    const box = bbox(points);
    const beamDir: BeamDir = globalDir ?? (box.w <= box.h ? "H" : "V");
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
  }, [points, rectilinear, globalDir]);

  // Per-bay: resolved direction + engine result for the ACTIVE room (overlay).
  const activeBayRows = useMemo(
    () =>
      bays.map((rect, i) => {
        const beamDir =
          dirOverrides[`${safeActive}:${i}`] ?? globalDir ?? defaultBeamDir(rect);
        let result = null;
        try {
          result = calculateSlab(bayToSlabInput({ rect, beamDir }));
        } catch {
          result = null;
        }
        return { rect, beamDir, result };
      }),
    [bays, dirOverrides, globalDir, safeActive],
  );

  const beamLayers = useMemo(
    () =>
      activeBayRows.map((r) =>
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
    [activeBayRows],
  );

  const scanOverlay = useMemo(
    () => (scan ? scanBeamsToOverlay({ beams: scan.beams }, scan.beamDir) : null),
    [scan],
  );

  // ── All closed rooms → priced rows, numbered continuously ─────
  const allRows = useMemo(() => {
    const out: SlabRow[] = [];
    rooms.forEach((room, ri) => {
      if (!room.closed || room.points.length < 4) return;
      if (isRectilinear(room.points)) {
        const rbays = decomposeToBays(room.points);
        const rws = rbays.map((rect, bi) => ({
          rect,
          beamDir: dirOverrides[`${ri}:${bi}`] ?? globalDir ?? defaultBeamDir(rect),
        }));
        out.push(...baysToSlabRows(rws, startSeq + out.length));
      } else {
        const box = bbox(room.points);
        const beamDir: BeamDir = globalDir ?? (box.w <= box.h ? "H" : "V");
        const { beams } = scanBeams(room.points, beamDir);
        out.push(...scanScheduleToSlabRows(beamSchedule(beams), startSeq + out.length));
      }
    });
    return out;
  }, [rooms, dirOverrides, globalDir, startSeq]);

  const closedRoomCount = rooms.filter(
    (r) => r.closed && r.points.length >= 4,
  ).length;
  const canAdd = allRows.length > 0;

  const totals = useMemo(() => {
    let beams = 0;
    let blocks = 0;
    for (const r of allRows) {
      if (r.result) {
        beams += r.result.beam_count;
        blocks += r.result.total_blocks;
      }
    }
    return { beams, blocks };
  }, [allRows]);

  // Wipe the persisted floor plan entirely (after a successful Add).
  const reset = () => {
    onDrawingChange(null);
    setActiveIndex(0);
  };

  const handleClose = () => {
    // Retain the in-progress floor plan (it's persisted) so closing the dialog
    // or a refresh doesn't lose it. Only a successful Add or Clear wipes it.
    onClose();
  };

  const handleAdd = () => {
    if (!allRows.length) return;
    onAddRooms(allRows);
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-[1400px] flex-col gap-3 sm:max-w-[1400px]">
        <DialogHeader>
          <DialogTitle>
            <Bi uz="Хоналар чизиш" en="Draw floor plan" />
          </DialogTitle>
          <DialogDescription>
            {t(
              "Бир нечта хона чизинг — биттасини ёпгач, грид бўйлаб кейингисини чизаверинг. Тўғри тўртбурчак хоналар аниқ, қийшиқ деворли хоналар скан-усулда ҳисобланади.",
              "Draw several rooms — close one, then keep drawing the next anywhere on the grid. Rectangular rooms compute exactly; rooms with angled walls are estimated via the scanline engine.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:flex-row">
          {/* Drawing surface ≈ 70% of the pop-up; it fills its column. */}
          <div className="flex min-h-0 min-w-0 flex-[7]">
            <RoomCanvas
              points={points}
              closed={activeClosed}
              onActiveChange={onActiveChange}
              activeKey={safeActive}
              backgroundRooms={backgroundRooms}
              onPickBackgroundRoom={(i) => setActiveIndex(i)}
              onRequestNewRoom={requestNewRoom}
              bays={bays}
              beamLayers={scanOverlay ? [scanOverlay] : beamLayers}
              fill
            />
          </div>

          <div className="flex min-h-0 w-full flex-[3] flex-col gap-2 overflow-y-auto lg:min-w-[15rem]">
            {/* Rooms list — switch active room, delete, or add a new one. */}
            <div className="flex flex-wrap items-center gap-1.5">
              {rooms.map((room, i) => (
                <div
                  key={i}
                  className={
                    "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs " +
                    (i === safeActive
                      ? "border-sky-500 bg-sky-50 text-sky-700"
                      : "border-slate-200 bg-white text-slate-600")
                  }
                >
                  <button
                    type="button"
                    onClick={() => setActiveIndex(i)}
                    className="font-medium"
                  >
                    {t(`Хона ${i + 1}`, `Room ${i + 1}`)}
                    {!room.closed && room.points.length > 0 && (
                      <span className="ml-1 text-[10px] text-amber-600">
                        {t("чизилмоқда", "drawing")}
                      </span>
                    )}
                  </button>
                  {rooms.length > 1 && (
                    <button
                      type="button"
                      onClick={() => deleteRoom(i)}
                      title={t("Хонани ўчириш", "Delete room")}
                      className="text-slate-400 transition-colors hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => requestNewRoom()}
                className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-50"
              >
                <Plus className="h-3 w-3" />
                {t("Хона", "Room")}
              </button>
            </div>

            {/* Persistent beam-direction control (Auto / H / V) — drives the
                scanline path and the default for every bay of the active room. */}
            {points.length >= 4 && (
              <div className="flex items-center justify-between gap-2 rounded border p-2 text-xs">
                <span className="font-medium">{t("Балка йўналиши", "Beam direction")}</span>
                <span className="inline-flex overflow-hidden rounded border">
                  {([
                    [null, t("Авто", "Auto")],
                    ["H", "H →"],
                    ["V", "V ↓"],
                  ] as Array<[BeamDir | null, string]>).map(([d, label]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setGlobalDir(d)}
                      className={
                        "px-2 py-0.5 " +
                        (globalDir === d
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground")
                      }
                    >
                      {label}
                    </button>
                  ))}
                </span>
              </div>
            )}

            <div className="text-sm font-medium text-foreground">
              {t(`Фаол: Хона ${safeActive + 1}`, `Editing: Room ${safeActive + 1}`)}
            </div>

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

            {/* Tapered / irregular: scanline summary + cut-list (active room). */}
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
              </div>
            )}

            {/* Rectilinear: per-bay summary + direction toggle (active room). */}
            {activeBayRows.map((r, i) => (
              <div key={i} className="rounded border p-2 text-xs">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {t(`Қисм ${i + 1}`, `Bay ${i + 1}`)} —{" "}
                    {(r.rect.w / 100).toFixed(2)}×{(r.rect.h / 100).toFixed(2)} m
                  </span>
                  <span className="inline-flex overflow-hidden rounded border">
                    {(["H", "V"] as BeamDir[]).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDir(safeActive, i, d)}
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

            {/* Grand total across all drawn rooms. */}
            {closedRoomCount > 0 && (
              <div className="mt-auto rounded-md border border-slate-300 bg-slate-50 p-2 text-xs">
                <div className="mb-1 font-semibold text-slate-700">
                  {t("Жами (барча хоналар)", "Total (all rooms)")}
                </div>
                <table className="w-full tabular-nums">
                  <tbody className="[&_td]:py-0.5 [&_td:first-child]:text-muted-foreground">
                    <tr>
                      <td>{t("Хоналар", "Rooms")}</td>
                      <td className="text-right font-medium">{closedRoomCount}</td>
                    </tr>
                    <tr>
                      <td>{t("Балка", "Beams")}</td>
                      <td className="text-right font-medium">{totals.beams}</td>
                    </tr>
                    <tr>
                      <td>{t("Ғишт", "Blocks")}</td>
                      <td className="text-right font-medium">{totals.blocks}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">
            {closedRoomCount > 0
              ? t(
                  `${closedRoomCount} та хона · ${allRows.length} қатор қўшилади`,
                  `${closedRoomCount} room${closedRoomCount > 1 ? "s" : ""} · ${allRows.length} row${allRows.length > 1 ? "s" : ""} will be added`,
                )
              : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleClose}>
              <Bi uz="Бекор қилиш" en="Cancel" />
            </Button>
            <Button size="sm" disabled={!canAdd} onClick={handleAdd}>
              <Bi uz="Хоналарни қўшиш" en="Add rooms" enClassName="font-normal opacity-90" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
