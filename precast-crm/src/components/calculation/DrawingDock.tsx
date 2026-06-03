"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff, X, CheckCircle2 } from "lucide-react";
import { ImageViewerProvider, useImageViewer } from "@/components/inbox/ImageViewer";
import { Bi } from "@/lib/i18n";
import type { SlabRow } from "@/components/calculation/MultiRoomCalculator";
import { fromDrag, isDegenerate, type NormBox } from "@/lib/annotation-box";

const MIN_W = 260;
const MAX_W = 900;
const DEFAULT_W = 480;
const WIDTH_KEY = "calc.drawingDockWidth";

/** The operator's saved dock width, clamped; falls back to the default. */
function readStoredWidth(): number {
  if (typeof window === "undefined") return DEFAULT_W;
  const raw = Number(window.localStorage.getItem(WIDTH_KEY));
  return Number.isFinite(raw) && raw >= MIN_W && raw <= MAX_W ? raw : DEFAULT_W;
}

// Per-room box colors, indexed by table position. Bright, distinct hues
// so a floor plan with several rooms stays readable.
const BOX_COLORS = [
  "#ef4444", "#3b82f6", "#22c55e", "#eab308",
  "#a855f7", "#ec4899", "#14b8a6", "#f97316",
];

interface DrawingDockProps {
  images: string[];
  error?: boolean;
  rows: SlabRow[];
  /** Drag produced a real box on `imagePath` → create/fill a room. */
  onCapture: (imagePath: string, box: NormBox) => void;
  onDeleteRow: (id: string) => void;
  highlightRowId: string | null;
  onHighlightRow: (id: string | null) => void;
}

/**
 * Sticky, resizable left rail showing the source chat's drawings beside the
 * calculator, with room-capture: drag a box around each room → it becomes a
 * calculator row. Boxes are normalized to the image so they survive resize.
 * A plain click (no drag) opens the shared lightbox (zoom / pan / ←→).
 *
 * Sticky-pane recipe (project CLAUDE.md): the parent flex row uses
 * `items-stretch`; this column is `self-start sticky`.
 */
export function DrawingDock(props: DrawingDockProps) {
  const [width, setWidth] = useState(DEFAULT_W);
  const widthRef = useRef(width);
  widthRef.current = width;
  const dragStart = useRef<{ x: number; w: number } | null>(null);

  // Load the operator's saved dock width after mount (SSR-safe).
  useEffect(() => {
    setWidth(readStoredWidth());
  }, []);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragStart.current) return;
      const next = dragStart.current.w + (e.clientX - dragStart.current.x);
      setWidth(Math.min(MAX_W, Math.max(MIN_W, next)));
    }
    function onUp() {
      if (!dragStart.current) return;
      dragStart.current = null;
      // Persist the chosen width so it becomes the default next time.
      try {
        window.localStorage.setItem(WIDTH_KEY, String(Math.round(widthRef.current)));
      } catch {
        /* quota / disabled — ignore */
      }
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <aside className="relative shrink-0 self-start sticky top-4" style={{ width }}>
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-3 py-2 text-sm font-medium flex items-center justify-between">
          <Bi uz="Чизма" en="Drawing" enClassName="text-muted-foreground font-normal" />
          {props.images.length > 0 && !props.error ? (
            <span className="text-[11px] font-normal text-muted-foreground">
              <Bi uz="Хонани белгилаш учун чизинг" en="Drag to mark a room" />
            </span>
          ) : null}
        </div>
        <ImageViewerProvider images={props.images}>
          <DockBody {...props} />
        </ImageViewerProvider>
      </div>

      {/* Resize handle — drag the right edge to balance drawing vs. table. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize drawing panel"
        onMouseDown={(e) => {
          dragStart.current = { x: e.clientX, w: width };
          e.preventDefault();
        }}
        className="absolute -right-1.5 top-0 h-full w-3 cursor-col-resize"
      />
    </aside>
  );
}

function DockBody({ images, error, rows, onCapture, onDeleteRow, highlightRowId, onHighlightRow }: DrawingDockProps) {
  const [reviewed, setReviewed] = useState(false);

  if (error) {
    return (
      <Placeholder>
        <Bi uz="Чизмани юклаб бўлмади" en="Couldn't load drawings" />
      </Placeholder>
    );
  }
  if (images.length === 0) {
    return (
      <Placeholder>
        <Bi uz="Бу чатда чизма йўқ" en="No drawings in this chat" />
      </Placeholder>
    );
  }

  // Coverage tally — what's captured so far. "Completeness" stays the
  // operator's visual call (no AI room-count), so this is a strong aid,
  // not an automatic guarantee.
  const withResult = rows.filter((r) => r.result);
  const totalArea = withResult.reduce((s, r) => s + (r.result?.monolith_area ?? 0), 0);
  const totalBeams = withResult.reduce((s, r) => s + (r.result?.beam_count ?? 0), 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-2 text-[12px]">
        <span className="font-semibold">{rows.length} хона</span>
        <span className="text-muted-foreground">Σ {totalArea.toFixed(1)} m²</span>
        <span className="text-muted-foreground">Σ {totalBeams} балка</span>
        <button
          type="button"
          onClick={() => setReviewed((v) => !v)}
          className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-muted"
          title="Тўлиқлигини операторнинг ўзи текширади · Completeness is operator-judged"
        >
          <CheckCircle2 className={`h-4 w-4 ${reviewed ? "text-success" : "text-muted-foreground/40"}`} />
          <Bi uz="Чизма тўлиқ" en="Plan reviewed" enClassName="text-muted-foreground font-normal" />
        </button>
      </div>
      <div className="max-h-[calc(100vh-220px)] space-y-2 overflow-y-auto p-2">
        {images.map((src) => (
          <ImageWithBoxes
            key={src}
            src={src}
            rows={rows}
            onCapture={onCapture}
            onDeleteRow={onDeleteRow}
            highlightRowId={highlightRowId}
            onHighlightRow={onHighlightRow}
          />
        ))}
      </div>
    </>
  );
}

function ImageWithBoxes({
  src,
  rows,
  onCapture,
  onDeleteRow,
  highlightRowId,
  onHighlightRow,
}: {
  src: string;
  rows: SlabRow[];
  onCapture: (imagePath: string, box: NormBox) => void;
  onDeleteRow: (id: string) => void;
  highlightRowId: string | null;
  onHighlightRow: (id: string | null) => void;
}) {
  const open = useImageViewer();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ sx: number; sy: number; ex: number; ey: number } | null>(null);

  const boxed = rows
    .map((row, idx) => ({ row, idx }))
    .filter((x) => x.row.box && x.row.box.imagePath === src);

  function localPt(e: React.MouseEvent) {
    const rc = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - rc.left, y: e.clientY - rc.top };
  }

  function onUp() {
    if (!drag) return;
    const rc = wrapRef.current!.getBoundingClientRect();
    const box = fromDrag({ x: drag.sx, y: drag.sy }, { x: drag.ex, y: drag.ey }, { width: rc.width, height: rc.height });
    setDrag(null);
    // A click (negligible drag) opens the lightbox; a real drag marks a room.
    if (isDegenerate(box)) open(src);
    else onCapture(src, box);
  }

  const band = drag
    ? {
        left: Math.min(drag.sx, drag.ex),
        top: Math.min(drag.sy, drag.ey),
        width: Math.abs(drag.ex - drag.sx),
        height: Math.abs(drag.ey - drag.sy),
      }
    : null;

  return (
    <div
      ref={wrapRef}
      className="relative cursor-crosshair select-none overflow-hidden rounded-md ring-1 ring-border"
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        const p = localPt(e);
        setDrag({ sx: p.x, sy: p.y, ex: p.x, ey: p.y });
      }}
      onMouseMove={(e) => {
        if (!drag) return;
        const p = localPt(e);
        setDrag({ ...drag, ex: p.x, ey: p.y });
      }}
      onMouseUp={onUp}
      onMouseLeave={() => setDrag(null)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" draggable={false} className="block w-full" />

      {boxed.map(({ row, idx }) => {
        const b = row.box!;
        const color = BOX_COLORS[idx % BOX_COLORS.length];
        const active = highlightRowId === row.id;
        return (
          <div
            key={row.id}
            onMouseEnter={() => onHighlightRow(row.id)}
            onMouseLeave={() => onHighlightRow(null)}
            onMouseDown={(e) => e.stopPropagation()}
            className="absolute"
            style={{
              left: `${b.x * 100}%`,
              top: `${b.y * 100}%`,
              width: `${b.w * 100}%`,
              height: `${b.h * 100}%`,
              border: `2px solid ${color}`,
              background: active ? `${color}40` : `${color}1a`,
              boxShadow: active ? `0 0 0 2px ${color}` : undefined,
            }}
          >
            <span
              className="absolute left-0 top-0 flex h-5 min-w-[20px] items-center justify-center rounded-br px-1 text-[11px] font-bold text-white"
              style={{ background: color }}
            >
              {idx + 1}
            </span>
            <button
              type="button"
              aria-label="Remove room box"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteRow(row.id);
              }}
              className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl bg-black/50 text-white hover:bg-black/70"
            >
              <X className="h-3 w-3" />
            </button>
            {row.result ? (
              <span className="absolute bottom-0 right-0 rounded-tl bg-black/55 px-1 text-[10px] font-medium leading-tight text-white">
                {row.result.monolith_area.toFixed(1)} m²
              </span>
            ) : null}
          </div>
        );
      })}

      {band && (
        <div
          className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/10"
          style={{ left: band.left, top: band.top, width: band.width, height: band.height }}
        />
      )}
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
      <ImageOff className="h-6 w-6" />
      {children}
    </div>
  );
}
