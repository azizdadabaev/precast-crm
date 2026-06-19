"use client";

import { useRef, useState } from "react";
import type React from "react";
import { Button } from "@/components/ui/button";
import {
  type Pt,
  type Rect,
  snapToGrid,
  snapOrtho,
} from "@/lib/cad/geometry";

interface RoomCanvasProps {
  points: Pt[];
  onChange: (points: Pt[]) => void;
  /** Grid step in cm (default 10). */
  gridCm?: number;
  /** Optional decomposed bays to overlay (translucent). */
  bays?: Rect[];
}

// ── Fixed cm→px mapping. v1: a fixed scale + a small margin origin. ──
const SCALE = 0.6; // px per cm
const MARGIN = 24; // px padding around the origin
const SVG_W = 680;
const SVG_H = 680;

// Click-to-close / drag pick radius, in px.
const HIT_PX = 12;

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
 * ortho-snapped, grid-snapped vertex. Close by clicking near the first point or
 * the Close button. Vertices are draggable handles once the loop is closed.
 */
export function RoomCanvas({
  points,
  onChange,
  gridCm = 10,
  bays,
}: RoomCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  // `closed` distinguishes draw-in-progress (open polyline) from a finished loop.
  const [closed, setClosed] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

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
    const snapped = snapToGrid(ortho, gridCm);
    onChange([...points, snapped]);
  };

  const handleVertexDown = (i: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setDragIdx(i);
  };

  const handleMove = (e: React.MouseEvent) => {
    if (dragIdx === null) return;
    const snapped = snapToGrid(eventToCm(e), gridCm);
    const next = points.slice();
    next[dragIdx] = snapped;
    onChange(next);
  };

  const endDrag = () => setDragIdx(null);

  const clear = () => {
    setClosed(false);
    setDragIdx(null);
    onChange([]);
  };

  const undo = () => {
    if (closed) {
      setClosed(false);
      return;
    }
    onChange(points.slice(0, -1));
  };

  const close = () => {
    if (points.length >= 3) setClosed(true);
  };

  // Grid lines.
  const gridStepPx = gridCm * SCALE;
  const gridLines: React.ReactNode[] = [];
  for (let x = MARGIN; x <= SVG_W; x += gridStepPx) {
    gridLines.push(
      <line key={`gx${x}`} x1={x} y1={0} x2={x} y2={SVG_H} stroke="#eef2f7" strokeWidth={1} />,
    );
  }
  for (let y = MARGIN; y <= SVG_H; y += gridStepPx) {
    gridLines.push(
      <line key={`gy${y}`} x1={0} y1={y} x2={SVG_W} y2={y} stroke="#eef2f7" strokeWidth={1} />,
    );
  }

  // Polyline / polygon path string.
  const pxPts = points.map(cmToPx);
  const pathPts = pxPts.map((p) => `${p.x},${p.y}`).join(" ");

  // Edge midpoint dimension labels. When closed, include the closing edge.
  const edgeCount = closed ? points.length : Math.max(0, points.length - 1);
  const labels: React.ReactNode[] = [];
  for (let i = 0; i < edgeCount; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const len = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
    if (len === 0) continue;
    const m = cmToPx({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    labels.push(
      <text
        key={`lbl${i}`}
        x={m.x}
        y={m.y - 4}
        fontSize={12}
        fill="#475569"
        textAnchor="middle"
        style={{ userSelect: "none", pointerEvents: "none" }}
      >
        {len}
      </text>,
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={undo} disabled={!points.length && !closed}>
          Undo last point
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={close} disabled={closed || points.length < 3}>
          Close loop
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={clear} disabled={!points.length}>
          Clear
        </Button>
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
        {gridLines}

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

        {/* Closed polygon fill, or in-progress polyline. */}
        {closed && points.length >= 3 ? (
          <polygon points={pathPts} fill="#0ea5e9" fillOpacity={0.06} stroke="#0284c7" strokeWidth={2} />
        ) : (
          points.length >= 2 && (
            <polyline points={pathPts} fill="none" stroke="#0284c7" strokeWidth={2} />
          )
        )}

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

      <p className="text-xs text-slate-500">
        {closed
          ? "Loop closed. Drag vertices to edit (snaps to grid)."
          : points.length === 0
            ? "Click on the canvas to start drawing. Each edge snaps orthogonal + to grid."
            : "Click to add points. Click the first vertex or “Close loop” to finish."}
      </p>
    </div>
  );
}
