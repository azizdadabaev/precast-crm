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

  const current = index !== null ? imagesRef.current[index] : null;
  const total = imagesRef.current.length;
  const isMulti = total > 1;

  return (
    <Ctx.Provider value={open}>
      {children}
      {index !== null && current && (
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
            onClick={(e) => e.stopPropagation()}
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
