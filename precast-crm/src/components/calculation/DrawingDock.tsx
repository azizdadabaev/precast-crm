"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff, X, CheckCircle2, Sparkles, Loader2 } from "lucide-react";
import { ImageViewerProvider, useImageViewer } from "@/components/inbox/ImageViewer";
import { Bi } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { SlabRow } from "@/components/calculation/MultiRoomCalculator";
import { fromDrag, isDegenerate, type NormBox } from "@/lib/annotation-box";

const MIN_W = 260;
const MAX_W = 900;
const DEFAULT_W = 480;
const WIDTH_KEY = "calc.drawingDockWidth";

// Per-room box colors, indexed by table position — bright, distinct hues.
const BOX_COLORS = [
  "#ef4444", "#3b82f6", "#22c55e", "#eab308",
  "#a855f7", "#ec4899", "#14b8a6", "#f97316",
];

/** The operator's saved dock width, clamped; falls back to the default. */
function readStoredWidth(): number {
  if (typeof window === "undefined") return DEFAULT_W;
  const raw = Number(window.localStorage.getItem(WIDTH_KEY));
  return Number.isFinite(raw) && raw >= MIN_W && raw <= MAX_W ? raw : DEFAULT_W;
}

interface DrawingDockProps {
  images: string[];
  error?: boolean;
  rows: SlabRow[];
  /** Drag produced a real box on `imagePath` → create/fill a room. */
  onCapture: (imagePath: string, box: NormBox) => void;
  onDeleteRow: (id: string) => void;
  /** Dismiss the dock (✕) for a clean full-width table. Hides the panel only —
   *  the chat link / dropped drawings are preserved; only Clear wipes them. */
  onHideDock: () => void;
  highlightRowId: string | null;
  onHighlightRow: (id: string | null) => void;
  /** Show the per-drawing "Extract with AI" button (gated by permission). */
  aiAssistEnabled?: boolean;
  /** Send the active docked drawing to the AI extractor. */
  onExtractAI?: (imagePath: string) => Promise<void>;
}

/**
 * Sticky, resizable left rail for room-capture beside the calculator.
 *
 * Layout: a coverage header, a thumbnail filmstrip of every chat image, and
 * one large active canvas the operator draws room boxes on. Pick a drawing in
 * the strip → it fills the canvas → drag boxes around each room; a plain click
 * opens the shared lightbox (to read measurement close-ups at full size).
 * Boxes are normalized to the image so they survive resize. Width persists.
 *
 * Sticky-pane recipe (project CLAUDE.md): the parent flex row uses
 * `items-stretch`; this column is `self-start sticky`.
 */
export function DrawingDock(props: DrawingDockProps) {
  const [width, setWidth] = useState(DEFAULT_W);
  const widthRef = useRef(width);
  widthRef.current = width;
  const dragStart = useRef<{ x: number; w: number } | null>(null);

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
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
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
        className="group absolute -right-2 top-0 flex h-full w-4 cursor-col-resize items-center justify-center"
      >
        <span className="h-10 w-1 rounded-full bg-border transition-colors group-hover:bg-primary" />
      </div>
    </aside>
  );
}

function DockBody({ images, error, rows, onCapture, onDeleteRow, onHideDock, highlightRowId, onHighlightRow, aiAssistEnabled, onExtractAI }: DrawingDockProps) {
  const [reviewed, setReviewed] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [aiBusy, setAiBusy] = useState(false);

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

  const active = images[Math.min(activeIdx, images.length - 1)];
  const withResult = rows.filter((r) => r.result);
  const totalArea = withResult.reduce((s, r) => s + (r.result?.monolith_area ?? 0), 0);
  const totalBeams = withResult.reduce((s, r) => s + (r.result?.beam_count ?? 0), 0);
  const countFor = (src: string) => rows.filter((r) => r.box?.imagePath === src).length;

  return (
    <div className="flex flex-col">
      {/* Coverage header */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">
          <Bi uz="Чизма" en="Drawing" enClassName="text-muted-foreground font-normal" />
        </span>
        <span className="ml-1 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
          <span className="font-semibold text-foreground">{rows.length}</span> хона
          <span className="text-border">·</span>
          <span className="font-medium text-foreground">{totalArea.toFixed(1)}</span> m²
          <span className="text-border">·</span>
          <span className="font-medium text-foreground">{totalBeams}</span> балка
        </span>
        <button
          type="button"
          onClick={() => setReviewed((v) => !v)}
          className={cn(
            "ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] transition-colors",
            reviewed ? "bg-success/10 text-success" : "text-muted-foreground hover:bg-muted",
          )}
          title="Тўлиқлигини операторнинг ўзи текширади · Completeness is operator-judged"
        >
          <CheckCircle2 className={cn("h-4 w-4", reviewed ? "text-success" : "text-muted-foreground/40")} />
          <Bi uz="Тўлиқ" en="Reviewed" enClassName="font-normal" />
        </button>
        {/* Dismiss the dock for a clean full-width table — keeps the chat link
            and any captured boxes; only Clear · Тозалаш wipes the link. */}
        <button
          type="button"
          onClick={onHideDock}
          aria-label="Hide drawing panel"
          title="Чизма панелини беркитиш — чат боғланиши сақланади · Hide the panel (keeps the chat link)"
          className="shrink-0 rounded-md p-1 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Thumbnail filmstrip — switch which drawing is the capture canvas. */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto border-b border-border bg-muted/30 px-2 py-2">
          {images.map((src, i) => {
            const n = countFor(src);
            return (
              <button
                key={src}
                type="button"
                onClick={() => setActiveIdx(i)}
                className={cn(
                  "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg ring-2 transition",
                  i === activeIdx ? "ring-primary" : "ring-transparent hover:ring-border",
                )}
                title={`Чизма ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
                {n > 0 && (
                  <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white shadow">
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Large active capture canvas */}
      <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-2">
        <CaptureCanvas
          src={active}
          rows={rows}
          onCapture={onCapture}
          onDeleteRow={onDeleteRow}
          highlightRowId={highlightRowId}
          onHighlightRow={onHighlightRow}
        />
        <p className="px-1 pt-2 text-center text-[11px] text-muted-foreground">
          <Bi uz="Хонани белгилаш учун чизинг · кўриш учун босинг" en="Drag to mark a room · click to zoom" />
        </p>
        {aiAssistEnabled && onExtractAI && (
          <button
            type="button"
            disabled={aiBusy}
            onClick={async () => {
              setAiBusy(true);
              try {
                await onExtractAI(active);
              } finally {
                setAiBusy(false);
              }
            }}
            className="mt-2 mx-auto flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {aiBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <Bi uz="AI билан ўлчаш" en="Extract with AI" />
          </button>
        )}
      </div>
    </div>
  );
}

function CaptureCanvas({
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
  const bandRef = useRef<HTMLDivElement>(null);
  const rectRef = useRef<{ left: number; top: number; width: number; height: number } | null>(null);

  // The in-progress drag is tracked entirely in refs and the selection band is
  // positioned IMPERATIVELY — a mousemove never sets React state, so it never
  // re-renders this canvas. The previous version called setDrag() on every
  // mousemove, re-rendering the full-size <img> + every captured-room box
  // ~100×/sec, which visibly stuttered while drawing a box (worse under memory
  // pressure). startRef = drag origin; lastRef = latest clamped cursor.
  const startRef = useRef<{ sx: number; sy: number } | null>(null);
  const lastRef = useRef<{ ex: number; ey: number } | null>(null);

  // Refs so the once-bound window listeners always see the latest values
  // (drawing continues even if the cursor leaves the image — no abrupt cancel).
  const srcRef = useRef(src);
  srcRef.current = src;
  const onCaptureRef = useRef(onCapture);
  onCaptureRef.current = onCapture;
  const openRef = useRef(open);
  openRef.current = open;

  // Position the dashed band straight from the start/last refs — no React state.
  function paintBand() {
    const s = startRef.current;
    const l = lastRef.current;
    const el = bandRef.current;
    if (!s || !l || !el) return;
    el.style.display = "block";
    el.style.left = `${Math.min(s.sx, l.ex)}px`;
    el.style.top = `${Math.min(s.sy, l.ey)}px`;
    el.style.width = `${Math.abs(l.ex - s.sx)}px`;
    el.style.height = `${Math.abs(l.ey - s.sy)}px`;
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const s = startRef.current;
      const rc = rectRef.current;
      if (!s || !rc) return;
      lastRef.current = {
        ex: Math.min(Math.max(0, e.clientX - rc.left), rc.width),
        ey: Math.min(Math.max(0, e.clientY - rc.top), rc.height),
      };
      paintBand();
    }
    function onUp() {
      const s = startRef.current;
      const l = lastRef.current;
      const rc = rectRef.current;
      startRef.current = null;
      if (bandRef.current) bandRef.current.style.display = "none";
      if (!s || !l || !rc) return;
      const box = fromDrag({ x: s.sx, y: s.sy }, { x: l.ex, y: l.ey }, { width: rc.width, height: rc.height });
      if (isDegenerate(box)) openRef.current(srcRef.current);
      else onCaptureRef.current(srcRef.current, box);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const boxed = rows
    .map((row, idx) => ({ row, idx }))
    .filter((x) => x.row.box && x.row.box.imagePath === src);

  return (
    <div
      ref={wrapRef}
      className="relative cursor-crosshair select-none overflow-hidden rounded-lg ring-1 ring-border"
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        const rc = wrapRef.current!.getBoundingClientRect();
        rectRef.current = { left: rc.left, top: rc.top, width: rc.width, height: rc.height };
        const sx = e.clientX - rc.left;
        const sy = e.clientY - rc.top;
        startRef.current = { sx, sy };
        lastRef.current = { ex: sx, ey: sy };
        paintBand();
      }}
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
            className="group absolute rounded-[4px] transition-shadow"
            style={{
              left: `${b.x * 100}%`,
              top: `${b.y * 100}%`,
              width: `${b.w * 100}%`,
              height: `${b.h * 100}%`,
              border: `2px solid ${color}`,
              background: active ? `${color}38` : `${color}14`,
              boxShadow: active ? `0 0 0 3px ${color}66` : "0 1px 4px rgba(0,0,0,0.25)",
            }}
          >
            <span
              className="absolute left-0 top-0 flex h-5 min-w-[20px] items-center justify-center rounded-br-md px-1 text-[11px] font-bold text-white"
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
              className="absolute right-0 top-0 hidden h-5 w-5 items-center justify-center rounded-bl-md bg-destructive text-white group-hover:flex"
            >
              <X className="h-3 w-3" />
            </button>
            {row.result ? (
              <span className="absolute bottom-0 right-0 rounded-tl-md bg-black/60 px-1 text-[10px] font-medium leading-tight text-white">
                {row.result.monolith_area.toFixed(1)} m²
              </span>
            ) : null}
          </div>
        );
      })}

      {/* Selection band — always mounted, positioned imperatively in paintBand
          so dragging never re-renders this canvas (see refs above). */}
      <div
        ref={bandRef}
        className="pointer-events-none absolute rounded-[4px] border-2 border-dashed border-primary bg-primary/15"
        style={{ display: "none" }}
      />
    </div>
  );
}

function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-sm text-muted-foreground">
      <ImageOff className="h-7 w-7 opacity-60" />
      {children}
    </div>
  );
}
