"use client";

import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
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
  isValidOutline,
} from "@/lib/cad/geometry";
import { unionShapes, subtractShapes, intersectShapes } from "@/lib/cad/boolean";
import { rectify } from "@/lib/cad/constraints";
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
import { type CalculatorDrawing, newRoomId } from "@/store/calculator";
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
const EMPTY_ROOM: RoomShape = { id: "", points: [], closed: false };

// three.js is heavy — load the 3D preview only when the operator opens it.
const Room3D = dynamic(() => import("@/components/cad/Room3D").then((m) => m.Room3D), {
  ssr: false,
});

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
  const wallThickCm = dr.wallThickCm ?? 0;
  const guides = dr.guides ?? [];
  // The drawn outline IS the true inner (clear) dimension the user gives — the
  // beam/block engine always uses it, unaffected by wall thickness. Walls are a
  // visual band drawn OUTWARD (see RoomCanvas); beams seat onto them by the
  // bearing parameter.

  const [activeIndex, setActiveIndex] = useState(0);
  // Multi-selection (room indices) for group operations. The active room is the
  // primary; shift-click / marquee add others.
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [show3D, setShow3D] = useState(false);
  const safeActive = Math.min(Math.max(0, activeIndex), rooms.length - 1);
  const activeRoom = rooms[safeActive] ?? EMPTY_ROOM;
  const points = activeRoom.points;
  const activeClosed = activeRoom.closed;
  const activeHoles = activeRoom.holes ?? [];

  // ── Writers ──────────────────────────────────────────────────
  const writeDrawing = (next: CalculatorDrawing) => onDrawingChange(next);

  // ── Global undo/redo: document-level snapshots of the WHOLE floor plan, so
  // undo crosses rooms and survives switching the active room. Snapshots are
  // safe to store by reference — every write builds new arrays/objects, so a
  // captured `dr` is never mutated in place. ──
  const undoStack = useRef<CalculatorDrawing[]>([]);
  const redoStack = useRef<CalculatorDrawing[]>([]);
  const [histTick, setHistTick] = useState(0);
  const pushUndo = () => {
    undoStack.current.push(dr);
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
    setHistTick((t) => t + 1);
  };
  const undo = () => {
    const prev = undoStack.current.pop();
    if (prev === undefined) return;
    redoStack.current.push(dr);
    setHistTick((t) => t + 1);
    onDrawingChange(prev.rooms.length ? prev : null);
  };
  const redo = () => {
    const nxt = redoStack.current.pop();
    if (nxt === undefined) return;
    undoStack.current.push(dr);
    setHistTick((t) => t + 1);
    onDrawingChange(nxt.rooms.length ? nxt : null);
  };
  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;
  void histTick;

  // Active room outline + closed (atomic) — feeds RoomCanvas.onActiveChange.
  // Preserves the room's stable id (minting one on the first edit of an empty
  // slot) so identity survives every edit.
  const onActiveChange = (pts: Pt[], closed: boolean) => {
    const cur = rooms[safeActive] ?? EMPTY_ROOM;
    const next = rooms.slice();
    next[safeActive] = { ...cur, id: cur.id || newRoomId(), points: pts, closed };
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

  const setWallThick = (v: number) =>
    writeDrawing({ ...dr, rooms, wallThickCm: Math.max(0, Math.min(100, v || 0)) });

  // Start a NEW room. Reuse the active slot if it's still empty (no litter),
  // else append + activate. A seed places the first point / a preset outline.
  const requestNewRoom = (seed?: Omit<RoomShape, "id">) => {
    pushUndo();
    const room: RoomShape = {
      id: newRoomId(),
      points: seed?.points ?? [],
      closed: seed?.closed ?? false,
    };
    const active = rooms[safeActive];
    if (active && active.points.length === 0) {
      const next = rooms.slice();
      next[safeActive] = room;
      writeDrawing({ ...dr, rooms: next });
      setSelectedIndices([safeActive]);
    } else {
      const next = [...rooms, room];
      writeDrawing({ ...dr, rooms: next });
      setActiveIndex(next.length - 1);
      setSelectedIndices([next.length - 1]);
    }
  };

  const deleteRoom = (i: number) => {
    pushUndo();
    const next = rooms.filter((_, k) => k !== i);
    writeDrawing({ ...dr, rooms: next.length ? next : [EMPTY_ROOM] });
    setSelectedIndices([]);
    setActiveIndex((cur) => {
      const c = cur > i ? cur - 1 : cur;
      return Math.min(Math.max(0, c), Math.max(0, next.length - 1));
    });
  };

  // Click a room: make it active. additive (shift) toggles it in/out of the
  // multi-selection; plain replaces the selection with just this room.
  const selectRoom = (i: number, additive: boolean) => {
    setActiveIndex(i);
    setSelectedIndices((prev) =>
      additive
        ? prev.includes(i)
          ? prev.filter((x) => x !== i)
          : [...prev, i]
        : [i],
    );
  };

  // Marquee finished: replace the selection with the swept rooms.
  const onSelectRooms = (indices: number[]) => {
    setSelectedIndices(indices);
    if (indices.length) setActiveIndex(indices[0]);
  };

  // Add a floor void (hole) to the active room, deducted from its slab BoM.
  const addVoid = (voidPts: Pt[]) => {
    const cur = rooms[safeActive];
    if (!cur) return;
    pushUndo();
    const next = rooms.slice();
    next[safeActive] = { ...cur, holes: [...(cur.holes ?? []), voidPts] };
    writeDrawing({ ...dr, rooms: next });
  };
  const clearVoids = () => {
    const cur = rooms[safeActive];
    if (!cur || !cur.holes?.length) return;
    pushUndo();
    const next = rooms.slice();
    next[safeActive] = { ...cur, holes: [] };
    writeDrawing({ ...dr, rooms: next });
  };

  // Square up the active room: constraint-solve every edge to exactly H/V, then
  // round to whole cm. Turns a hand-drawn almost-orthogonal outline into a clean
  // rectilinear one (which the exact bay engine prefers). Undoable; ignored if
  // the result self-intersects.
  const squareUp = () => {
    if (!activeClosed || points.length < 4) return;
    const next = rectify(points).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
    if (!isValidOutline(next, true)) return;
    pushUndo();
    onActiveChange(next, true);
  };

  // Construction guides (infinite reference lines), global across the plan.
  const addGuide = (g: { a: Pt; b: Pt }) => {
    pushUndo();
    writeDrawing({ ...dr, rooms, guides: [...(dr.guides ?? []), g] });
  };
  const clearGuides = () => {
    if (!dr.guides?.length) return;
    pushUndo();
    writeDrawing({ ...dr, rooms, guides: [] });
  };

  // Boolean ops on the 2+ room selection: union / subtract (active − rest) /
  // intersect. Replaces the selected rooms with the result (one undo). Subtract
  // can yield a room with holes (a courtyard), which the void engine handles.
  const applyBoolean = (op: "union" | "subtract" | "intersect") => {
    const sel = selectedIndices.filter(
      (i) => rooms[i]?.closed && rooms[i].points.length >= 3,
    );
    if (sel.length < 2) return;
    const shapeOf = (i: number) => ({ points: rooms[i].points, holes: rooms[i].holes });
    let results;
    if (op === "union") results = unionShapes(sel.map(shapeOf));
    else if (op === "intersect") results = intersectShapes(sel.map(shapeOf));
    else {
      const baseIdx = sel.includes(safeActive) ? safeActive : sel[0];
      results = subtractShapes(
        shapeOf(baseIdx),
        sel.filter((i) => i !== baseIdx).map(shapeOf),
      );
    }
    if (!results.length) return;
    pushUndo();
    const kept = rooms.filter((_, i) => !sel.includes(i));
    const created: RoomShape[] = results.map((s) => ({
      id: newRoomId(),
      points: s.points,
      closed: true,
      holes: s.holes.length ? s.holes : undefined,
    }));
    const next = [...kept, ...created];
    writeDrawing({ ...dr, rooms: next.length ? next : [EMPTY_ROOM] });
    setSelectedIndices([]);
    setActiveIndex(kept.length); // first created room
  };

  // Live group transform from the gizmo: write each room's new points. Undo is
  // checkpointed once per gesture by the canvas (onPushUndo on first move).
  const applyGroupTransform = (updates: Array<{ index: number; points: Pt[] }>) => {
    const next = rooms.slice();
    for (const u of updates) {
      if (next[u.index]) next[u.index] = { ...next[u.index], points: u.points };
    }
    writeDrawing({ ...dr, rooms: next });
  };

  // Backdrop = every room but the active one, with at least one point.
  const backgroundRooms = rooms
    .map((r, i) => ({ points: r.points, closed: r.closed, label: String(i + 1), index: i }))
    .filter((r) => r.index !== safeActive && r.points.length >= 1);

  // ── Active room derivations (interactive overlay) ─────────────
  // Engine outline = the drawn outline (the user's true inner/clear dimension).
  const enginePoints = points;

  // A room with floor voids can't use the exact bay path → route to scanline.
  const rectilinear = useMemo(
    () =>
      enginePoints.length >= 4
        ? isRectilinear(enginePoints) && activeHoles.length === 0
        : true,
    [enginePoints, activeHoles],
  );

  const bays = useMemo(
    () => (enginePoints.length >= 4 && rectilinear ? decomposeToBays(enginePoints) : []),
    [enginePoints, rectilinear],
  );

  const scan = useMemo(() => {
    if (enginePoints.length < 4 || rectilinear) return null;
    const box = bbox(enginePoints);
    const beamDir: BeamDir = globalDir ?? (box.w <= box.h ? "H" : "V");
    const { beams } = scanBeams(enginePoints, beamDir, undefined, undefined, activeHoles);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enginePoints, rectilinear, globalDir, activeHoles]);

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
      // Bill the clear inner face when walls are on; voids route to scanline.
      const inner = room.points;
      const rHoles = room.holes ?? [];
      if (isRectilinear(inner) && rHoles.length === 0) {
        const rbays = decomposeToBays(inner);
        const rws = rbays.map((rect, bi) => ({
          rect,
          beamDir: dirOverrides[`${ri}:${bi}`] ?? globalDir ?? defaultBeamDir(rect),
        }));
        out.push(...baysToSlabRows(rws, startSeq + out.length));
      } else {
        const box = bbox(inner);
        const beamDir: BeamDir = globalDir ?? (box.w <= box.h ? "H" : "V");
        const { beams } = scanBeams(inner, beamDir, undefined, undefined, rHoles);
        out.push(...scanScheduleToSlabRows(beamSchedule(beams), startSeq + out.length));
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, dirOverrides, globalDir, startSeq, wallThickCm]);

  // Per-room beam + block rects (world cm) for the 3D preview — computed via the
  // scanline overlay so it covers rectilinear AND tapered rooms (+ voids), and
  // only while the 3D view is open.
  const room3dData = useMemo(() => {
    if (!show3D) return [];
    return rooms
      .filter((r) => r.closed && r.points.length >= 4)
      .map((room) => {
        const inner = room.points;
        const box = bbox(inner);
        const beamDir: BeamDir = globalDir ?? (box.w <= box.h ? "H" : "V");
        const { beams } = scanBeams(inner, beamDir, undefined, undefined, room.holes ?? []);
        const overlay = scanBeamsToOverlay({ beams }, beamDir);
        return { beams: overlay.beams, blocks: overlay.blockCells };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show3D, rooms, globalDir, wallThickCm]);

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

  // After a successful Add we KEEP the floor plan in the store (so Save Draft
  // persists it and reopening "Draw room" restores the exact outlines) — only
  // reset the dialog-local undo/active state. The page-level Clear wipes it.
  const reset = () => {
    setActiveIndex(0);
    undoStack.current = [];
    redoStack.current = [];
    setHistTick((t) => t + 1);
  };

  const handleClose = () => {
    // Retain the in-progress floor plan (it's persisted) so closing the dialog
    // or a refresh doesn't lose it. Only a successful Add or Clear wipes it.
    onClose();
  };

  const handleAdd = () => {
    if (!allRows.length) return;
    // Tag the rows as drawing-sourced so re-adding after an edit REPLACES the
    // prior drawn rows (handleDrawnRooms) instead of duplicating them.
    onAddRooms(allRows.map((r) => ({ ...r, fromDrawing: true })));
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="flex h-[95vh] w-[98vw] max-w-[1800px] flex-col gap-3 sm:max-w-[1800px]">
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
          {/* Drawing surface — the larger share of the pop-up; it fills its column. */}
          <div className="relative flex min-h-0 min-w-0 flex-[8]">
            {show3D && (
              <div className="absolute inset-0 z-20 flex flex-col rounded-md bg-slate-100">
                <div className="flex items-center justify-between border-b bg-white px-2 py-1 text-xs">
                  <span className="font-medium">{t("3D кўриниш", "3D preview")}</span>
                  <button
                    type="button"
                    onClick={() => setShow3D(false)}
                    className="rounded border px-2 py-0.5 text-slate-600 hover:bg-slate-50"
                  >
                    {t("2D га қайтиш", "Back to 2D")}
                  </button>
                </div>
                <div className="min-h-0 flex-1">
                  <Room3D data={room3dData} />
                </div>
              </div>
            )}
            <RoomCanvas
              points={points}
              closed={activeClosed}
              onActiveChange={onActiveChange}
              onPushUndo={pushUndo}
              onUndo={undo}
              onRedo={redo}
              canUndo={canUndo}
              canRedo={canRedo}
              backgroundRooms={backgroundRooms}
              onPickBackgroundRoom={(i, additive) => selectRoom(i, additive)}
              onRequestNewRoom={requestNewRoom}
              selectedIndices={selectedIndices}
              activeIndexValue={safeActive}
              onSelectRooms={(indices) => onSelectRooms(indices)}
              onGroupTransform={applyGroupTransform}
              wallThickCm={wallThickCm}
              holes={activeHoles}
              onAddVoid={addVoid}
              guides={guides}
              onAddGuide={addGuide}
              bays={bays}
              beamLayers={scanOverlay ? [scanOverlay] : beamLayers}
              fill
            />
          </div>

          <div className="flex min-h-0 w-full flex-[2] flex-col gap-2 overflow-y-auto lg:min-w-[15rem]">
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

            {/* Boolean combine — shown when 2+ rooms are selected. */}
            {selectedIndices.length >= 2 && (
              <div className="flex flex-wrap items-center gap-1.5 rounded border border-indigo-200 bg-indigo-50/50 p-2 text-xs">
                <span className="font-medium text-indigo-700">
                  {t("Бирлаштириш", "Combine")} ({selectedIndices.length})
                </span>
                {([
                  ["union", "∪", t("Бирлашма", "Union")],
                  ["subtract", "−", t("Айириш", "Subtract")],
                  ["intersect", "∩", t("Кесишма", "Intersect")],
                ] as Array<["union" | "subtract" | "intersect", string, string]>).map(
                  ([op, sym, label]) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => applyBoolean(op)}
                      title={label}
                      className="rounded border bg-white px-2 py-0.5 text-slate-700 transition-colors hover:bg-indigo-100"
                    >
                      <span className="mr-1 font-semibold">{sym}</span>
                      {label}
                    </button>
                  ),
                )}
              </div>
            )}

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

            {/* Wall thickness — drawn outline is the TRUE inner dimension; the
                wall renders OUTWARD (visual). Does NOT change beam/block counts. */}
            <div className="flex items-center justify-between gap-2 rounded border p-2 text-xs">
              <span className="font-medium">{t("Девор қалинлиги", "Wall thickness")}</span>
              <span className="inline-flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={wallThickCm || ""}
                  onChange={(e) => setWallThick(Number(e.target.value))}
                  placeholder="0"
                  className="w-14 rounded border px-1.5 py-0.5 text-right tabular-nums"
                />
                <span className="text-muted-foreground">{t("см", "cm")}</span>
              </span>
            </div>

            {/* 3D preview + Square-up (constraint solver). */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setShow3D((v) => !v)}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                {show3D ? t("2D га қайтиш", "Back to 2D") : t("3D да кўриш", "View in 3D")}
              </button>
              {activeClosed && points.length >= 4 && (
                <button
                  type="button"
                  onClick={squareUp}
                  title={t(
                    "Деворларни аниқ горизонтал/вертикал қилиш",
                    "Constraint-solve every wall to exactly horizontal/vertical",
                  )}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  {t("Тўғрилаш", "Square up")}
                </button>
              )}
            </div>

            {/* Floor voids: the Void tool draws a stairwell/shaft that deducts
                from the slab. Shown when the active room has any. */}
            {activeHoles.length > 0 && (
              <button
                type="button"
                onClick={clearVoids}
                className="self-start rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 transition-colors hover:bg-amber-100"
              >
                {t(
                  `${activeHoles.length} та бўшлиқ — тозалаш`,
                  `${activeHoles.length} void${activeHoles.length > 1 ? "s" : ""} — clear`,
                )}
              </button>
            )}

            {guides.length > 0 && (
              <button
                type="button"
                onClick={clearGuides}
                className="self-start rounded border border-purple-300 bg-purple-50 px-2 py-1 text-xs text-purple-800 transition-colors hover:bg-purple-100"
              >
                {t(
                  `${guides.length} та йўналтирувчи — тозалаш`,
                  `${guides.length} guide${guides.length > 1 ? "s" : ""} — clear`,
                )}
              </button>
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
