"use client";

import { ImageViewerProvider, useImageViewer } from "@/components/inbox/ImageViewer";

/**
 * Presentational strip of receipt thumbnails. Renders ~64px rounded
 * thumbnails that open full-size in the shared inbox image viewer on click.
 * Renders nothing when there are no receipts.
 */
export function ReceiptStrip({ urls }: { urls: string[] }) {
  if (urls.length === 0) return null;
  return (
    <ImageViewerProvider images={urls}>
      <Thumbs urls={urls} />
    </ImageViewerProvider>
  );
}

function Thumbs({ urls }: { urls: string[] }) {
  const open = useImageViewer();
  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((url) => (
        <button
          key={url}
          type="button"
          onClick={() => open(url)}
          className="h-16 w-16 shrink-0 overflow-hidden rounded-lg ring-1 ring-border transition hover:ring-primary"
          aria-label="Open receipt"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="h-full w-full object-cover" />
        </button>
      ))}
    </div>
  );
}
