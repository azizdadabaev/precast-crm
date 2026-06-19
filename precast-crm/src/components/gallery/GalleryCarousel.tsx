"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface GalleryCarouselProps {
  images: Array<{ id: string; url: string }>;
  alt: string;
  onImageClick: (index: number) => void;
}

/**
 * Instagram-style image carousel for a gallery post with >1 image. A native
 * scroll-snap row gives free touch-swipe; dot indicators track the active slide;
 * chevrons appear on hover for desktop. Each slide is a button that opens the
 * lightbox at that image. A tap fires onClick; a swipe scrolls — the browser
 * distinguishes them, so no custom drag handling is needed.
 */
export function GalleryCarousel({ images, alt, onImageClick }: GalleryCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== active) setActive(Math.max(0, Math.min(images.length - 1, idx)));
  }

  function scrollTo(idx: number) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div className="group/carousel relative">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex aspect-[4/3] w-full snap-x snap-mandatory overflow-x-auto bg-muted [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => onImageClick(i)}
            aria-label={`Open photo ${i + 1} of ${images.length}`}
            className="relative w-full shrink-0 snap-center focus-visible:outline-none"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt={alt}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>

      {/* Count pill */}
      <div className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-mono font-semibold text-white tabular-nums">
        {active + 1}/{images.length}
      </div>

      {/* Desktop chevrons (hover) */}
      {active > 0 && (
        <button
          type="button"
          onClick={() => scrollTo(active - 1)}
          aria-label="Previous photo"
          className="absolute left-1.5 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover/carousel:opacity-100 sm:flex"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      {active < images.length - 1 && (
        <button
          type="button"
          onClick={() => scrollTo(active + 1)}
          aria-label="Next photo"
          className="absolute right-1.5 top-1/2 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity hover:bg-black/70 group-hover/carousel:opacity-100 sm:flex"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* Dot indicators */}
      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-center gap-1.5">
        {images.map((img, i) => (
          <span
            key={img.id}
            className={
              i === active
                ? "h-1.5 w-1.5 rounded-full bg-white shadow ring-1 ring-black/20"
                : "h-1.5 w-1.5 rounded-full bg-white/55 shadow ring-1 ring-black/10"
            }
          />
        ))}
      </div>
    </div>
  );
}
