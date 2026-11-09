"use client";

/**
 * The «Жойлашув» board surface: SVG in cm, pan (drag empty space), zoom (wheel),
 * drag rooms with wall-gap snapping (Alt = free), R = turn, Delete = back to tray,
 * Ctrl+Z / Ctrl+Y = board undo/redo, drop tray cards to place them.
 * Drag state is local; the store is written once on pointer-up so typing in the
 * table never pays for board re-renders mid-drag.
 */
import * as React from "react";
import type { SlabRow } from "@/components/calculation/MultiRoomCalculator";
import { useCalculatorStore } from "@/store/calculator";
import { overlaps, roomRect, type CmRect, type RoomLayout } from "@/lib/layout-board/model";
import { snapRect, type SnapGuide } from "@/lib/layout-board/snap";
import { RoomBlock, WallBand } from "./RoomBlock";

export const TRAY_DRAG_TYPE = "application/x-layout-room";
const SNAP_PX = 10;

export type BoardView = { scale: number; ox: number; oy: number }; // px per cm, px offset

export function fitView(rects: CmRect[], wallCm: number, w: number, h: number): BoardView {
  if (rects.length === 0 || w <= 0 || h <= 0) return { scale: 0.12, ox: 40, oy: 40 };
  const x0 = Math.min(...rects.map((r) => r.x)) - wallCm;
  const y0 = Math.min(...rects.map((r) => r.y)) - wallCm;
  const x1 = Math.max(...rects.map((r) => r.x + r.w)) + wallCm;
  const y1 = Math.max(...rects.map((r) => r.y + r.h)) + wallCm;
  const pad = 32;
  const scale = Math.min((w - 2 * pad) / (x1 - x0), (h - 2 * pad) / (y1 - y0), 0.6);
  return { scale, ox: (w - (x1 - x0) * scale) / 2 - x0 * scale, oy: (h - (y1 - y0) * scale) / 2 - y0 * scale };
}

type Drag =
  | { kind: "room"; id: string; startX: number; startY: number; from: RoomLayout; moved: boolean }
  | { kind: "pan"; startX: number; startY: number; from: BoardView };

export function BoardCanvas({
  rows,
  wallCm,
  view,
  onViewChange,
  selectedId,
  onSelect,
}: {
  rows: SlabRow[];
  wallCm: number;
  view: BoardView;
  onViewChange: (v: BoardView) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const placeRoom = useCalculatorStore((s) => s.placeRoom);
  const unplaceRoom = useCalculatorStore((s) => s.unplaceRoom);
  const rotateRoom = useCalculatorStore((s) => s.rotateRoom);
  const undoLayout = useCalculatorStore((s) => s.undoLayout);
  const redoLayout = useCalculatorStore((s) => s.redoLayout);

  const svgRef = React.useRef<SVGSVGElement>(null);
  const drag = React.useRef<Drag | null>(null);
  const [live, setLive] = React.useState<{ id: string; layout: RoomLayout; guides: SnapGuide[] } | null>(null);

  const placed = rows.filter((r) => r.layout && r.result && !r.result.is_extras_only);
  const numberOf = (id: string) => rows.findIndex((r) => r.id === id) + 1;
  const layoutOf = (r: SlabRow): RoomLayout => (live && live.id === r.id ? live.layout : r.layout!);

  const toCm = (clientX: number, clientY: number) => {
    const box = svgRef.current!.getBoundingClientRect();
    return { x: (clientX - box.left - view.ox) / view.scale, y: (clientY - box.top - view.oy) / view.scale };
  };

  const snapped = (row: SlabRow, want: RoomLayout, free: boolean) => {
    const rect = roomRect(row, want);
    const others = placed.filter((o) => o.id !== row.id).map((o) => roomRect(o, o.layout!));
    const s = snapRect(rect, others, { wallCm, thresholdCm: SNAP_PX / view.scale, grid: !free });
    return { layout: { ...want, x: free ? want.x : s.x, y: free ? want.y : s.y }, guides: free ? [] : s.guides };
  };

  function onRoomDown(e: React.PointerEvent, row: SlabRow) {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind: "room", id: row.id, startX: e.clientX, startY: e.clientY, from: row.layout!, moved: false };
    onSelect(row.id);
    svgRef.current?.focus();
  }

  function onBackgroundDown(e: React.PointerEvent) {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind: "pan", startX: e.clientX, startY: e.clientY, from: view };
    onSelect(null);
    svgRef.current?.focus();
  }

  /** Where the dragged room goes for this pointer position (snapped unless Alt). */
  function dragTarget(d: Extract<Drag, { kind: "room" }>, e: React.PointerEvent) {
    const row = rows.find((r) => r.id === d.id);
    if (!row) return null;
    const want = {
      ...d.from,
      x: d.from.x + (e.clientX - d.startX) / view.scale,
      y: d.from.y + (e.clientY - d.startY) / view.scale,
    };
    return snapped(row, want, e.altKey);
  }

  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.kind === "pan") {
      onViewChange({ ...d.from, ox: d.from.ox + dx, oy: d.from.oy + dy });
      return;
    }
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    d.moved = true;
    const s = dragTarget(d, e);
    if (s) setLive({ id: d.id, layout: s.layout, guides: s.guides });
  }

  function onUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    // Recompute from the release event itself: the last `live` render may lag a fast drag.
    if (d?.kind === "room" && d.moved) {
      const s = dragTarget(d, e);
      if (s) placeRoom(d.id, s.layout);
    }
    setLive(null);
  }

  function onWheel(e: React.WheelEvent) {
    const box = svgRef.current!.getBoundingClientRect();
    const px = e.clientX - box.left;
    const py = e.clientY - box.top;
    const k = Math.exp(-e.deltaY * 0.0015);
    const scale = Math.max(0.02, Math.min(2, view.scale * k));
    const f = scale / view.scale;
    onViewChange({ scale, ox: px - (px - view.ox) * f, oy: py - (py - view.oy) * f });
  }

  function onKey(e: React.KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === "z" || e.key === "Z") && !e.shiftKey) { e.preventDefault(); undoLayout(); return; }
    if (mod && (e.key === "y" || ((e.key === "z" || e.key === "Z") && e.shiftKey))) { e.preventDefault(); redoLayout(); return; }
    if (!selectedId) return;
    if (e.key === "r" || e.key === "R" || e.key === "к" || e.key === "К") { e.preventDefault(); rotateRoom(selectedId); }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); unplaceRoom(selectedId); onSelect(null); }
  }

  function onDrop(e: React.DragEvent) {
    const id = e.dataTransfer.getData(TRAY_DRAG_TYPE);
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    e.preventDefault();
    const p = toCm(e.clientX, e.clientY);
    const size = roomRect(row, { x: 0, y: 0, rot: 0 });
    const s = snapped(row, { x: p.x - size.w / 2, y: p.y - size.h / 2, rot: 0 }, e.altKey);
    placeRoom(row.id, s.layout);
    onSelect(row.id);
  }

  const rects = placed.map((r) => ({ id: r.id, rect: roomRect(r, layoutOf(r)) }));
  const overlapping = new Set(
    rects.filter((a) => rects.some((b) => b.id !== a.id && overlaps(a.rect, b.rect))).map((a) => a.id),
  );

  return (
    <svg
      ref={svgRef}
      tabIndex={0}
      className="h-full w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onPointerDown={onBackgroundDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onWheel={onWheel}
      onKeyDown={onKey}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(TRAY_DRAG_TYPE)) e.preventDefault();
      }}
      onDrop={onDrop}
      role="application"
      aria-label="Жойлашув тахтаси"
    >
      <g transform={`translate(${view.ox} ${view.oy}) scale(${view.scale})`}>
        {placed.map((r) => (
          <WallBand key={`w${r.id}`} row={r} layout={layoutOf(r)} wallCm={wallCm} />
        ))}
        {placed.map((r) => (
          <RoomBlock
            key={r.id}
            row={r}
            number={numberOf(r.id)}
            layout={layoutOf(r)}
            selected={selectedId === r.id}
            overlapping={overlapping.has(r.id)}
            onPointerDown={(e) => onRoomDown(e, r)}
          />
        ))}
        {live?.guides.map((g, i) =>
          g.axis === "x" ? (
            <line key={i} x1={g.at} x2={g.at} y1={g.from - 40} y2={g.to + 40} stroke="hsl(var(--primary))"
              strokeWidth={1.5 / view.scale} strokeDasharray={`${6 / view.scale} ${4 / view.scale}`} />
          ) : (
            <line key={i} y1={g.at} y2={g.at} x1={g.from - 40} x2={g.to + 40} stroke="hsl(var(--primary))"
              strokeWidth={1.5 / view.scale} strokeDasharray={`${6 / view.scale} ${4 / view.scale}`} />
          ),
        )}
      </g>
    </svg>
  );
}
