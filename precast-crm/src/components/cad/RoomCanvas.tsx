"use client";

import { useRef, useState } from "react";
import type React from "react";
import { Button } from "@/components/ui/button";
import {
  type Pt,
  type Rect,
  snapToGrid,
  snapOrtho,
  setEdgeLength,
} from "@/lib/cad/geometry";

interface RoomCanvasProps {
  points: Pt[];
  onChange: (points: Pt[]) => void;
  /** Initial grid step in cm (default 10). User can change it via the controls. */
  gridCm?: number;
  /** Optional decomposed bays to overlay (translucent). */
  bays?: Rect[];
  /**
   * Optional per-bay beam/block visual (from `beamLayout`). Index-aligned
   * with `bays`: beam strips render filled + distinct; block cells render as a
   * thin grid. All rects are in cm inside their bay.
   */
  beamLayers?: Array<{ beams: Rect[]; blockCells: Rect[] }>;
}

// ── Fixed cm→px mapping. v1: a fixed scale + a small margin origin. ──
const SCALE = 0.6; // px per cm
const MARGIN = 24; // px padding around the origin
const SVG_W = 680;
const SVG_H = 680;

// Click-to-close / drag pick radius, in px.
const HIT_PX = 12;

// Grid-size options offered in the controls bar (cm).
const GRID_OPTIONS = [5, 10, 25, 50] as const;

const BAY_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

/**
 * Controlled SVG drawing surface for a rectilinear room outline. Points are in
 * CENTIMETRES; screen uses y-down. Draw mode: click empty canvas to append an
 * ortho-snapped, (optionally) grid-snapped vertex. Close by clicking near the
 * first point or the Close button. Once closed, vertices are draggable handles
 * and edges are clickable to type an exact length.
 */
export function RoomCanvas({
  points,
  onChange,
  gridCm = 10,
  bays,
  beamLayers,
}: RoomCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  // `closed` distinguishes draw-in-progress (open polyline) from a finished loop.
  const [closed, setClosed] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  // CAD controls: live grid size + snap on/off. Seeded from the `gridCm` prop.
  const [grid, setGrid] = useState<number>(gridCm);
  const [snap, setSnap] = useState(true);
  const step = grid; // grid step == snap step (they move together by design).

  // Selected edge (index of points[i] → points[i+1]) + its draft length text.
  const [selEdge, setSelEdge] = useState<number | null>(null);
  const [lenInput, setLenInput] = useState("");

  const maybeSnap = (p: Pt): Pt => (snap ? snapToGrid(p, step) : p);

  const cmToPx = (p: Pt): { x: number; y: number } => ({
    x: MARGIN + p.x * SCALE,
    y: MARGIN + p.y * SCALE,
  });

  /** Convert a mouse event to cm coords in the SVG's user space. */
  const eventToCm = (e: React.MouseEvent): Pt => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    // viewBox maps 1:1 to SVG_W×SVG_H user units, so scale by the rendered size.
    const ux = ((e.clientX - rect.left) / rect.width) * SVG_W;
    const uy = ((e.clientY - rect.top) / rect.height) * SVG_H;
    return { x: (ux - MARGIN) / SCALE, y: (uy - MARGIN) / SCALE };
  };

  const distPx = (a: Pt, b: Pt): number => {
    const pa = cmToPx(a);
    const pb = cmToPx(b);
    return Math.hypot(pa.x - pb.x, pa.y - pb.y);
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (closed || dragIdx !== null) return;
    const raw = eventToCm(e);

    // Close affordance: click near the first vertex finalizes the loop.
    if (points.length >= 3 && distPx(raw, points[0]) <= HIT_PX) {
      setClosed(true);
      return;
    }

    const prev = points[points.length - 1];
    const ortho = prev ? snapOrtho(prev, raw) : raw;
    onChange([...points, maybeSnap(ortho)]);
  };

  const handleVertexDown = (i: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setDragIdx(i);
  };

  const handleMove = (e: React.MouseEvent) => {
    if (dragIdx === null) return;
    const next = points.slice();
    next[dragIdx] = maybeSnap(eventToCm(e));
    onChange(next);
  };

  const endDrag = () => setDragIdx(null);

  const clear = () => {
    setClosed(false);
    setDragIdx(null);
    setSelEdge(null);
    onChange([]);
  };

  const undo = () => {
    if (closed) {
      setClosed(false);
      return;
    }
    setSelEdge(null);
    onChange(points.slice(0, -1));
  };

  const close = () => {
    if (points.length >= 3) setClosed(true);
  };

  // ── Edge selection + keyboard length entry ──
  const edgeCount = closed ? points.length : Math.max(0, points.length - 1);

  const edgeLenCm = (i: number): number => {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    return Math.round(Math.hypot(b.x - a.x, b.y - a.y));
  };

  const selectEdge = (i: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelEdge(i);
    setLenInput(String(edgeLenCm(i)));
  };

  const applyLen = () => {
    if (selEdge === null) return;
    const next = Number(lenInput);
    if (Number.isFinite(next) && next > 0) {
      onChange(setEdgeLength(points, selEdge, next));
    }
  };

  // ── Grid: minor lines every `grid` cm, major every 5×grid, axis emphasis. ──
  const gridStepPx = grid * SCALE;
  const majorEvery = 5;
  const minor: React.ReactNode[] = [];
  const major: React.ReactNode[] = [];
  // Index lines from the cm origin (MARGIN) so major/minor stay aligned as the
  // grid size changes; bounded to the canvas extent so we never emit thousands.
  let col = 0;
  for (let x = MARGIN; x <= SVG_W; x += gridStepPx, col++) {
    const isMajor = col % majorEvery === 0;
    (isMajor ? major : minor).push(
      <line
        key={`gx${x}`}
        x1={x}
        y1={0}
        x2={x}
        y2={SVG_H}
        stroke={isMajor ? "#dbe2ea" : "#eef2f7"}
        strokeWidth={isMajor ? 1.25 : 1}
      />,
    );
  }
  let row = 0;
  for (let y = MARGIN; y <= SVG_H; y += gridStepPx, row++) {
    const isMajor = row % majorEvery === 0;
    (isMajor ? major : minor).push(
      <line
        key={`gy${y}`}
        x1={0}
        y1={y}
        x2={SVG_W}
        y2={y}
        stroke={isMajor ? "#dbe2ea" : "#eef2f7"}
        strokeWidth={isMajor ? 1.25 : 1}
      />,
    );
  }
  // Origin axes (the cm 0,0 lines) get a subtle stronger emphasis.
  const axes = (
    <>
      <line x1={MARGIN} y1={0} x2={MARGIN} y2={SVG_H} stroke="#c2ccd6" strokeWidth={1.5} />
      <line x1={0} y1={MARGIN} x2={SVG_W} y2={MARGIN} stroke="#c2ccd6" strokeWidth={1.5} />
    </>
  );

  // Polyline / polygon path string.
  const pxPts = points.map(cmToPx);
  const pathPts = pxPts.map((p) => `${p.x},${p.y}`).join(" ");

  // Edge midpoint dimension labels + invisible-wide click targets per edge.
  const labels: React.ReactNode[] = [];
  const edgeHits: React.ReactNode[] = [];
  for (let i = 0; i < edgeCount; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const len = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
    if (len === 0) continue;
    const pa = cmToPx(a);
    const pb = cmToPx(b);
    const m = cmToPx({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const selected = selEdge === i;
    // Fat transparent line as the click target (only when closed = editable).
    if (closed) {
      edgeHits.push(
        <line
          key={`hit${i}`}
          x1={pa.x}
          y1={pa.y}
          x2={pb.x}
          y2={pb.y}
          stroke="transparent"
          strokeWidth={14}
          style={{ cursor: "pointer" }}
          onClick={selectEdge(i)}
        />,
      );
    }
    if (selected) {
      labels.push(
        <line
          key={`sel${i}`}
          x1={pa.x}
          y1={pa.y}
          x2={pb.x}
          y2={pb.y}
          stroke="#f59e0b"
          strokeWidth={3}
          style={{ pointerEvents: "none" }}
        />,
      );
    }
    labels.push(
      <text
        key={`lbl${i}`}
        x={m.x}
        y={m.y - 4}
        fontSize={12}
        fill={selected ? "#b45309" : "#475569"}
        fontWeight={selected ? 700 : 400}
        textAnchor="middle"
        style={{ userSelect: "none", cursor: closed ? "pointer" : "default" }}
        onClick={closed ? selectEdge(i) : undefined}
      >
        {len}
      </text>,
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={undo} disabled={!points.length && !closed}>
          Undo last point
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={close} disabled={closed || points.length < 3}>
          Close loop
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={clear} disabled={!points.length}>
          Clear
        </Button>

        <span className="mx-1 h-5 w-px bg-slate-200" />

        {/* Grid-size selector — drives both the visible grid and the snap step. */}
        <label className="flex items-center gap-1 text-xs text-slate-600">
          Grid
          <select
            className="rounded border bg-white px-1.5 py-1 text-xs"
            value={grid}
            onChange={(e) => setGrid(Number(e.target.value))}
          >
            {GRID_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g} cm
              </option>
            ))}
          </select>
        </label>

        {/* Snap on/off toggle. */}
        <label className="flex items-center gap-1 text-xs text-slate-600">
          <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} />
          Snap
        </label>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full max-w-[680px] rounded border bg-white"
        style={{ touchAction: "none", cursor: closed ? "default" : "crosshair" }}
        onClick={handleCanvasClick}
        onMouseMove={handleMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        {minor}
        {major}
        {axes}

        {/* Bay overlays (decomposed rectangles). */}
        {bays?.map((b, i) => {
          const tl = cmToPx({ x: b.x, y: b.y });
          const color = BAY_COLORS[i % BAY_COLORS.length];
          return (
            <rect
              key={`bay${i}`}
              x={tl.x}
              y={tl.y}
              width={b.w * SCALE}
              height={b.h * SCALE}
              fill={color}
              fillOpacity={0.14}
              stroke={color}
              strokeOpacity={0.5}
              strokeWidth={1}
            />
          );
        })}

        {/* Beam/block visual overlay (from beamLayout) — block cells as a
            thin grid, then beam strips filled on top in a distinct color. */}
        {beamLayers?.map((layer, bi) => (
          <g key={`bl${bi}`}>
            {layer.blockCells.map((c, ci) => {
              const tl = cmToPx({ x: c.x, y: c.y });
              return (
                <rect
                  key={`blk${bi}-${ci}`}
                  x={tl.x}
                  y={tl.y}
                  width={c.w * SCALE}
                  height={c.h * SCALE}
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth={0.5}
                  style={{ pointerEvents: "none" }}
                />
              );
            })}
            {layer.beams.map((b, bmi) => {
              const tl = cmToPx({ x: b.x, y: b.y });
              return (
                <rect
                  key={`beam${bi}-${bmi}`}
                  x={tl.x}
                  y={tl.y}
                  width={b.w * SCALE}
                  height={b.h * SCALE}
                  fill="#0f766e"
                  fillOpacity={0.55}
                  stroke="#0f766e"
                  strokeWidth={0.5}
                  style={{ pointerEvents: "none" }}
                />
              );
            })}
          </g>
        ))}

        {/* Closed polygon fill, or in-progress polyline. */}
        {closed && points.length >= 3 ? (
          <polygon points={pathPts} fill="#0ea5e9" fillOpacity={0.06} stroke="#0284c7" strokeWidth={2} />
        ) : (
          points.length >= 2 && (
            <polyline points={pathPts} fill="none" stroke="#0284c7" strokeWidth={2} />
          )
        )}

        {/* Per-edge click targets (closed only), under labels + handles. */}
        {edgeHits}

        {labels}

        {/* Vertex handles. */}
        {pxPts.map((p, i) => (
          <circle
            key={`v${i}`}
            cx={p.x}
            cy={p.y}
            r={6}
            fill={i === 0 && !closed ? "#0284c7" : "#fff"}
            stroke="#0284c7"
            strokeWidth={2}
            style={{ cursor: "grab" }}
            onMouseDown={handleVertexDown(i)}
            onClick={(e) => e.stopPropagation()}
          />
        ))}
      </svg>

      {/* Inline numeric length editor for the selected edge. */}
      {closed && selEdge !== null && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-600">
            Edge {selEdge + 1} length
          </span>
          <input
            type="number"
            min={1}
            autoFocus
            className="w-24 rounded border px-2 py-1"
            value={lenInput}
            onChange={(e) => setLenInput(e.target.value)}
            onBlur={applyLen}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLen();
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                setSelEdge(null);
              }
            }}
          />
          <span className="text-slate-500">cm</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setSelEdge(null)}>
            Done
          </Button>
        </div>
      )}

      <p className="text-xs text-slate-500">
        {closed
          ? "Loop closed. Drag vertices to move; click an edge (or its number) to type an exact length."
          : points.length === 0
            ? "Click on the canvas to start drawing. Each edge snaps orthogonal" +
              (snap ? " + to grid." : ".")
            : "Click to add points. Click the first vertex or “Close loop” to finish."}
      </p>
    </div>
  );
}
