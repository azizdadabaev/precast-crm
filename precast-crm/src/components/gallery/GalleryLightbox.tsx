"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ChevronLeft, ChevronRight, X, ExternalLink } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface GalleryPhoto {
  id: string;
  orderId: string;
  orderNumber: string;
  clientName: string;
  kind: string;
  url: string;
  uploadedAt: string;
}

interface GalleryLightboxProps {
  photo: GalleryPhoto;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

export function GalleryLightbox({
  photo,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
}: GalleryLightboxProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasPrev) onPrev();
      else if (e.key === "ArrowRight" && hasNext) onNext();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasPrev, hasNext, onPrev, onNext, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Header bar */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between gap-3 px-4 py-3 text-white bg-gradient-to-b from-black/70 to-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-mono font-bold text-sm">{photo.orderNumber}</span>
          <span className="text-sm truncate">{photo.clientName}</span>
          <span className="text-xs font-mono text-white/60 hidden md:inline">
            {formatDate(photo.uploadedAt)}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/orders/${photo.orderId}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-white/90 hover:text-white border border-white/30 hover:border-white/60 rounded-md px-2.5 py-1.5 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Open order →</span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Prev */}
      {hasPrev && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          aria-label="Previous"
          className="absolute left-4 h-12 w-12 inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <ChevronLeft className="h-7 w-7" />
        </button>
      )}

      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={photo.orderNumber}
        className="max-h-[90vh] max-w-[90vw] object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Next */}
      {hasNext && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          aria-label="Next"
          className="absolute right-4 h-12 w-12 inline-flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <ChevronRight className="h-7 w-7" />
        </button>
      )}
    </div>
  );
}
