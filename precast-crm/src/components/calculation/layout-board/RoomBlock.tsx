"use client";

/**
 * One room on the «Жойлашув» board (SVG, cm units): wall band, inner room, the
 * slab's beams and block rows from the quote, and the room label. Pure drawing;
 * dragging lives in BoardCanvas.
 */
import * as React from "react";
import { beamLayout, type CadPattern } from "@/lib/cad/geometry";
import { roomRect, slabRect, type RoomLayout } from "@/lib/layout-board/model";
import { roomLabelLines } from "@/lib/layout-board/labels";
import type { SlabRow } from "@/components/calculation/MultiRoomCalculator";

/** Wall band around a room. Drawn for ALL rooms before any room, so no band covers a neighbour's beam ends. */
export const WallBand = React.memo(function WallBand({ row, layout, wallCm }: { row: SlabRow; layout: RoomLayout; wallCm: number }) {
  const room = roomRect(row, layout);
  return (
    <rect
      x={room.x - wallCm}
      y={room.y - wallCm}
      width={room.w + 2 * wallCm}
      height={room.h + 2 * wallCm}
      fill="hsl(var(--muted-foreground) / 0.35)"
    />
  );
});

/** Memoised: a keystroke in the table re-renders only the row that changed (rows keep identity). */
export const RoomBlock = React.memo(function RoomBlock({
  row,
  number,
  layout,
  selected,
  overlapping,
  onPointerDownRoom,
}: {
  row: SlabRow;
  number: number;
  layout: RoomLayout;
  selected: boolean;
  overlapping: boolean;
  onPointerDownRoom?: (e: React.PointerEvent<SVGGElement>, rowId: string) => void;
}) {
  const r = row.result!;
  const room = roomRect(row, layout);
  const slab = slabRect(row, layout);
  const bay = beamLayout(
    { rect: slab, beamDir: layout.rot === 0 ? "V" : "H" },
    r.beam_count,
    r.block_rows,
    r.blocks_per_row,
    r.beam_length * 100,
    r.pattern as CadPattern,
    row.bearing * 100,
  );
  const lines = roomLabelLines(row);
  const fs = Math.max(12, Math.min(26, Math.min(room.w, room.h) / 9));
  const boxW = Math.min(room.w - 8, fs * 9.5);
  const boxH = fs * 1.35 * (lines.length + 1) + fs * 0.6;
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;

  return (
    <g onPointerDown={(e) => onPointerDownRoom?.(e, row.id)} style={{ cursor: "grab" }} data-room={row.id}>
      <rect x={room.x} y={room.y} width={room.w} height={room.h} fill="hsl(var(--card))" />
      {bay.blockCells.map((c, i) => (
        <rect
          key={`b${i}`}
          x={c.x + 0.6}
          y={c.y + 0.6}
          width={Math.max(0, c.w - 1.2)}
          height={Math.max(0, c.h - 1.2)}
          fill="hsl(var(--muted-foreground) / 0.16)"
          stroke="hsl(var(--muted-foreground) / 0.4)"
          strokeWidth={0.8}
        />
      ))}
      {bay.beams.map((b, i) => (
        <rect key={`m${i}`} x={b.x} y={b.y} width={b.w} height={b.h} fill="hsl(var(--foreground) / 0.62)" />
      ))}
      <rect
        x={room.x}
        y={room.y}
        width={room.w}
        height={room.h}
        fill="none"
        stroke={overlapping ? "hsl(var(--destructive))" : selected ? "hsl(var(--primary))" : "none"}
        strokeWidth={overlapping || selected ? 5 : 0}
      />
      <rect
        x={cx - boxW / 2}
        y={cy - boxH / 2}
        width={boxW}
        height={boxH}
        rx={fs * 0.4}
        fill="hsl(var(--card) / 0.92)"
        stroke="hsl(var(--border))"
        strokeWidth={1.5}
      />
      <text
        x={cx}
        y={cy - boxH / 2 + fs * 1.35}
        textAnchor="middle"
        fontSize={fs * 1.1}
        fontWeight={700}
        fill="hsl(var(--primary))"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {number}
      </text>
      {lines.map((t, i) => (
        <text
          key={i}
          x={cx}
          y={cy - boxH / 2 + fs * 1.35 * (i + 2)}
          textAnchor="middle"
          fontSize={i === 1 ? fs : fs * 0.85}
          fontWeight={i === 1 || i === 3 ? 700 : 400}
          fill={i === 0 ? "hsl(var(--muted-foreground))" : "hsl(var(--foreground))"}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {t}
        </text>
      ))}
    </g>
  );
});
