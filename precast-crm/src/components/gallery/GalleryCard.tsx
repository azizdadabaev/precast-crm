"use client";

import Link from "next/link";
import { Phone, MapPin } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import { addressToCyrillic } from "@/lib/regions";
import { GalleryCarousel } from "@/components/gallery/GalleryCarousel";
import type { GalleryPost } from "@/lib/gallery-posts";

interface GalleryCardProps {
  post: GalleryPost;
  /** Open the lightbox at the given image index within this post. */
  onOpen: (imageIndex: number) => void;
}

// Kind labels are split into mobile-only (Uzbek primary) and full
// bilingual (sm+) so the badge never wraps on a narrow phone card.
const KIND_META: Record<
  GalleryPost["kind"],
  { short: string; full: string; className: string }
> = {
  LOADED: {
    short: "Юкланди",
    full: "Юкланди · Loaded",
    className: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  },
  DELIVERY_PROOF: {
    short: "Етказилди",
    full: "Етказилди · Delivered",
    className: "bg-green-500/10 text-green-700 border-green-500/30",
  },
  SHIPMENT_LOADED: {
    short: "Жўнатма",
    full: "Жўнатма · Shipment",
    className: "bg-indigo-500/10 text-indigo-700 border-indigo-500/30",
  },
};

export function GalleryCard({ post, onOpen }: GalleryCardProps) {
  const meta = KIND_META[post.kind];
  const alt = `${post.orderNumber} — ${post.clientName}`;
  const multi = post.images.length > 1;

  return (
    // Two clickable surfaces: the image(s) open the lightbox, the metadata block
    // navigates to the order detail page. Kept as separate elements (not a
    // <button> nested in a <Link>, which is invalid HTML) so each has its own
    // focus ring and there are no hydration warnings.
    <div className="rounded-xl border border-border bg-card overflow-hidden hover:shadow-md active:shadow-sm transition-shadow">
      {multi ? (
        <GalleryCarousel images={post.images} alt={alt} onImageClick={onOpen} />
      ) : (
        <button
          type="button"
          onClick={() => onOpen(0)}
          aria-label="Open photo"
          className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99] transition-transform"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={post.images[0].url}
            alt={alt}
            loading="lazy"
            decoding="async"
            className="aspect-[4/3] w-full object-cover bg-muted"
          />
        </button>
      )}
      <Link
        href={`/orders/${post.orderId}`}
        title="Буюртма саҳифасига ўтиш · Open order"
        className="block px-3 py-3 sm:p-3 space-y-1.5 hover:bg-accent/80 active:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="font-mono font-bold text-xs text-primary tracking-tight truncate whitespace-nowrap">
            {post.orderNumber}
          </span>
          <span
            className={cn(
              "shrink-0 text-[9px] sm:text-[10px] font-mono uppercase tracking-wide sm:tracking-wider border rounded-full px-1.5 sm:px-2 py-0.5 whitespace-nowrap",
              meta.className,
            )}
          >
            <span className="sm:hidden">{meta.short}</span>
            <span className="hidden sm:inline">{meta.full}</span>
          </span>
        </div>
        <div className="text-sm sm:text-[15px] font-semibold leading-tight truncate">
          {post.clientName}
        </div>
        {post.clientPhone && (
          // Phone is its own action — stop propagation so the surrounding Link
          // doesn't swallow the tap that should open the dialer. Negative margin
          // + extra padding gives a ≥44px tap zone without throwing off the
          // visual rhythm.
          <a
            href={`tel:+${post.clientPhone}`}
            onClick={(e) => e.stopPropagation()}
            title="Қўнғироқ қилиш · Call"
            className="-mx-1 -my-1 px-1.5 py-1.5 inline-flex items-center gap-1.5 rounded-md text-sm font-medium font-mono tabular-nums whitespace-nowrap hover:text-primary active:bg-primary/10 transition-colors"
          >
            <Phone className="h-3.5 w-3.5 shrink-0" />
            {formatPhone(post.clientPhone)}
          </a>
        )}
        {post.clientAddress && (
          <div className="flex items-start gap-1.5 text-xs sm:text-[13px] text-muted-foreground leading-snug">
            <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="line-clamp-2 break-words">
              {addressToCyrillic(post.clientAddress)}
            </span>
          </div>
        )}
        <div className="text-[11px] font-mono text-text-tertiary pt-0.5">
          {formatDate(post.uploadedAt)}
        </div>
      </Link>
    </div>
  );
}
