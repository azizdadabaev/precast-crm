"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";

const Ctx = createContext<(src: string) => void>(() => {});

export function useImageViewer() {
  return useContext(Ctx);
}

export function ImageViewerProvider({ images, children }: { images: string[]; children: React.ReactNode }) {
  const imagesRef = useRef(images);
  imagesRef.current = images;

  const [index, setIndex] = useState<number | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);

  // Reset zoom/pan whenever the shown image changes (or viewer closes)
  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setDragging(false);
  }, [index]);

  const open = useCallback((src: string) => {
    const i = imagesRef.current.indexOf(src);
    setIndex(i >= 0 ? i : 0);
  }, []);

  const close = useCallback(() => setIndex(null), []);

  const prev = useCallback(() => {
    setIndex((i) => (i !== null && i > 0 ? i - 1 : i));
  }, []);

  const next = useCallback(() => {
    setIndex((i) => (i !== null && i < imagesRef.current.length - 1 ? i + 1 : i));
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (index === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, close, prev, next]);

  // Native non-passive wheel listener — React's onWheel is passive, so
  // preventDefault() is silently ignored there and the browser's page-zoom fires.
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setScale((s) => {
        const next = s * (e.deltaY < 0 ? 1.15 : 1 / 1.15);
        return Math.min(6, Math.max(1, next));
      });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [index]); // re-bind when a new image is open (index !== null when rendered)

  // Window-level drag listeners (only while dragging)
  useEffect(() => {
    if (!dragging) return;
    function onMouseMove(e: MouseEvent) {
      setOffset({
        x: e.clientX - dragOrigin.current.x,
        y: e.clientY - dragOrigin.current.y,
      });
    }
    function onMouseUp() {
      setDragging(false);
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging]);

  const current = index !== null ? imagesRef.current[index] : null;
  const total = imagesRef.current.length;
  const isMulti = total > 1;

  return (
    <Ctx.Provider value={open}>
      {children}
      {index !== null && current && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-[70] bg-black/90 flex items-center justify-center"
          onClick={close}
        >
          {/* Top-right controls */}
          <div
            className="absolute top-0 right-0 flex items-center gap-1 p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <a
              href={current}
              download
              target="_blank"
              rel="noreferrer"
              aria-label="Download image"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <Download className="h-4 w-4" />
            </a>
            <button
              type="button"
              aria-label="Close lightbox"
              onClick={(e) => { e.stopPropagation(); close(); }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Prev chevron */}
          {isMulti && index > 0 && (
            <button
              type="button"
              aria-label="Previous image"
              onClick={(e) => { e.stopPropagation(); prev(); }}
              className="absolute left-2 sm:left-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <ChevronLeft className="h-7 w-7" />
            </button>
          )}

          {/* Image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current}
            alt=""
            className="max-h-[92vh] max-w-[92vw] object-contain"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "default",
              transition: dragging ? "none" : "transform 0.12s ease-out",
              willChange: "transform",
            }}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={() => { setScale(1); setOffset({ x: 0, y: 0 }); }}
            onMouseDown={(e) => {
              if (scale <= 1) return;
              e.preventDefault();
              dragOrigin.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
              setDragging(true);
            }}
          />

          {/* Next chevron */}
          {isMulti && index < total - 1 && (
            <button
              type="button"
              aria-label="Next image"
              onClick={(e) => { e.stopPropagation(); next(); }}
              className="absolute right-2 sm:right-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            >
              <ChevronRight className="h-7 w-7" />
            </button>
          )}

          {/* Counter */}
          {isMulti && (
            <div
              className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-[12px] font-medium text-white"
              onClick={(e) => e.stopPropagation()}
            >
              {index + 1} / {total}
            </div>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}
