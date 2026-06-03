"use client";

import { useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { ImageViewerProvider, useImageViewer } from "@/components/inbox/ImageViewer";
import { Bi } from "@/lib/i18n";

const MIN_W = 260;
const MAX_W = 680;
const DEFAULT_W = 400;

/**
 * Sticky, resizable left rail that shows the source chat's drawings beside
 * the calculator. Source-agnostic: `images` are conversation media when the
 * calculator is launched fresh from a chat, or project-owned copies when a
 * linked draft is reopened. Clicking a drawing opens the shared lightbox
 * (zoom / pan / ←→) reused from the inbox.
 *
 * Sticky-pane recipe (see project CLAUDE.md): the parent flex row uses
 * `items-stretch`; this column is `self-start sticky` so it pins while the
 * tall calculator column scrolls past it.
 */
export function DrawingDock({ images, error }: { images: string[]; error?: boolean }) {
  const [width, setWidth] = useState(DEFAULT_W);
  const dragStart = useRef<{ x: number; w: number } | null>(null);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragStart.current) return;
      const next = dragStart.current.w + (e.clientX - dragStart.current.x);
      setWidth(Math.min(MAX_W, Math.max(MIN_W, next)));
    }
    function onUp() {
      dragStart.current = null;
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <aside
      className="relative shrink-0 self-start sticky top-4"
      style={{ width }}
    >
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-3 py-2 text-sm font-medium">
          <Bi uz="Чизма" en="Drawing" enClassName="text-muted-foreground font-normal" />
          {images.length > 1 ? (
            <span className="ml-1 text-xs text-muted-foreground">({images.length})</span>
          ) : null}
        </div>
        <ImageViewerProvider images={images}>
          <DockBody images={images} error={error} />
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

function DockBody({ images, error }: { images: string[]; error?: boolean }) {
  const open = useImageViewer();

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

  return (
    <div className="max-h-[calc(100vh-160px)] space-y-2 overflow-y-auto p-2">
      {images.map((src) => (
        <button
          key={src}
          type="button"
          onClick={() => open(src)}
          className="block w-full overflow-hidden rounded-md ring-1 ring-border transition hover:ring-primary"
          title="Click to zoom"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="block w-full object-contain" />
        </button>
      ))}
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
