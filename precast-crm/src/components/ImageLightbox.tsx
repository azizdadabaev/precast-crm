"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface ImageLightboxProps {
  url: string;
  alt?: string;
  caption?: string;
  onClose: () => void;
}

/**
 * Minimal single-image lightbox. Click-outside or Escape closes.
 * Use for photos that have no sibling navigation (truck-loaded,
 * delivery-proof). For multi-photo browsing, use GalleryLightbox.
 */
export function ImageLightbox({ url, alt, caption, onClose }: ImageLightboxProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {caption && (
        <div
          className="absolute top-0 left-0 right-0 px-4 py-3 text-white text-sm bg-gradient-to-b from-black/70 to-transparent flex items-center justify-between"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="truncate">{caption}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
      {!caption && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 h-9 w-9 inline-flex items-center justify-center rounded-md text-white/90 hover:text-white bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt ?? ""}
        className="max-h-[90vh] max-w-[90vw] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
