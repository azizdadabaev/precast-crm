"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";

interface GalleryPhoto {
  id: string;
  orderId: string;
  orderNumber: string;
  clientName: string;
  kind: "LOADED" | "DELIVERY_PROOF" | "SHIPMENT_LOADED";
  url: string;
  uploadedAt: string;
  uploadedBy: { id: string; name: string } | null;
}

interface GalleryCardProps {
  photo: GalleryPhoto;
  onClick: () => void;
}

const KIND_META: Record<
  GalleryPhoto["kind"],
  { label: string; className: string }
> = {
  LOADED: {
    label: "Юкланди · Loaded",
    className: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  },
  DELIVERY_PROOF: {
    label: "Етказилди · Delivered",
    className: "bg-green-500/10 text-green-700 border-green-500/30",
  },
  SHIPMENT_LOADED: {
    label: "Жўнатма · Shipment",
    className: "bg-indigo-500/10 text-indigo-700 border-indigo-500/30",
  },
};

export function GalleryCard({ photo, onClick }: GalleryCardProps) {
  const meta = KIND_META[photo.kind];
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative rounded-lg border border-border bg-card overflow-hidden hover:shadow-md transition-shadow text-left"
    >
      <Link
        href={`/orders/${photo.orderId}`}
        onClick={(e) => e.stopPropagation()}
        title="Open order"
        className="absolute top-2 right-2 z-10 h-7 w-7 inline-flex items-center justify-center rounded-md bg-background/80 backdrop-blur-sm border border-border text-text-tertiary hover:text-foreground hover:bg-background transition-colors"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={`${photo.orderNumber} — ${photo.clientName}`}
        loading="lazy"
        decoding="async"
        className="aspect-[4/3] w-full object-cover bg-muted"
      />
      <div className="p-3 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono font-bold text-xs text-primary">
            {photo.orderNumber}
          </span>
          <span
            className={cn(
              "text-[10px] font-mono uppercase tracking-wider border rounded-full px-2 py-0.5",
              meta.className,
            )}
          >
            {meta.label}
          </span>
        </div>
        <div className="text-sm font-medium truncate">{photo.clientName}</div>
        <div className="text-[11px] font-mono text-text-tertiary">
          {formatDate(photo.uploadedAt)}
        </div>
      </div>
    </button>
  );
}
