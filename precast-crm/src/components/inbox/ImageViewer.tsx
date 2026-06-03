"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Download } from "lucide-react";

type ViewerState = { images: string[]; index: number } | null;

const Ctx = createContext<(images: string[], index: number) => void>(() => {});

export function useImageViewer() {
  return useContext(Ctx);
}

export function ImageViewerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ViewerState>(null);

  const open = useCallback((images: string[], index: number) => setState({ images, index }), []);
  const close = useCallback(() => setState(null), []);

  const prev = useCallback(() => {
    setState((s) => s && s.index > 0 ? { ...s, index: s.index - 1 } : s);
  }, []);

  const next = useCallback(() => {
    setState((s) => s && s.index < s.images.length - 1 ? { ...s, index: s.index + 1 } : s);
  }, []);

  useEffect(() => {
    if (!state) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, close, prev, next]);

  const current = state ? state.images[state.index] : null;
  const total = state ? state.images.length : 0;
  const isMulti = total > 1;

  return (
    <Ctx.Provider value={open}>
      {children}
      {state && current && (
        <div
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
          {isMulti && state.index > 0 && (
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
            onClick={(e) => e.stopPropagation()}
          />

          {/* Next chevron */}
          {isMulti && state.index < total - 1 && (
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
              {state.index + 1} / {total}
            </div>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}
