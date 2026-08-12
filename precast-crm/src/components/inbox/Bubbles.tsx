"use client";

import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MessageMedia } from "@/components/inbox/MediaRenderers";
import { useImageViewer } from "@/components/inbox/ImageViewer";
import type { InboxMessage, RenderItem } from "./inbox-types";
import { TG, TAIL_MASK_LEFT, TAIL_MASK_RIGHT } from "./inbox-style";
import { clock, dateLabel } from "./inbox-utils";

export function Bubble({
  msg,
  groupedTop,
  hasTail,
  onDelete,
}: {
  msg: InboxMessage;
  groupedTop: boolean;
  hasTail: boolean;
  /** When set and the message is OUTBOUND, a hover trash requests deletion. */
  onDelete?: (id: string) => void;
}) {
  const outgoing = msg.direction === "OUTBOUND";
  // Media that fills the bubble edge-to-edge and overlays its own footer.
  const overlayMedia =
    !msg.text && (msg.mediaKind === "IMAGE" || msg.mediaKind === "VIDEO" || msg.mediaKind === "VIDEO_NOTE");

  const footer = (
    <span
      className={cn("flex select-none items-center gap-1 text-[11px] leading-none", overlayMedia ? "text-white" : msg.failed ? "text-destructive" : "")}
      style={overlayMedia || msg.failed ? undefined : { color: outgoing ? "var(--tg-meta-out)" : "var(--tg-text-dim)" }}
    >
      {clock(msg.createdAt)}
      {outgoing && !msg.failed && <SentCheck />}
      {msg.failed && <span className="font-semibold">! · юборилмади</span>}
    </span>
  );

  return (
    <div
      className={cn(
        "group flex items-center gap-1 tg-msg-in",
        outgoing ? "justify-end" : "justify-start",
        groupedTop ? "mt-[2px]" : "mt-[10px]",
      )}
    >
      {outgoing && onDelete && (
        <button
          type="button"
          onClick={() => onDelete(msg.id)}
          title="Ўчириш · Delete"
          aria-label="Delete message"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[color:var(--tg-text-dim)] opacity-0 transition-opacity hover:bg-[var(--tg-list-hover)] hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <div
        className={cn(
          "relative max-w-[min(72%,600px)] text-[14px] leading-[1.35] text-[var(--tg-text)]",
          overlayMedia ? "overflow-hidden" : "px-2.5 py-1.5",
          // rounded corners — tighten the tail corner on the tailed bubble
          "rounded-[16px]",
          hasTail && (outgoing ? "rounded-br-[5px]" : "rounded-bl-[5px]"),
          msg.failed && "ring-1 ring-destructive/60",
        )}
        style={{
          background: overlayMedia ? "transparent" : outgoing ? TG.outgoing : TG.incoming,
          boxShadow: overlayMedia ? "none" : outgoing ? "0 1px 1px rgba(0,0,0,.06)" : "0 1px 2px rgba(0,0,0,.08)",
        }}
      >
        {/* Tail notch */}
        {hasTail && !overlayMedia && (
          <Tail outgoing={outgoing} color={outgoing ? TG.outgoing : TG.incoming} />
        )}

        {overlayMedia ? (
          <MessageMedia
            mediaKind={msg.mediaKind}
            mediaPath={msg.mediaPath}
            mediaName={msg.mediaName}
            mediaMeta={msg.mediaMeta}
            messageId={msg.id}
            outgoing={outgoing}
            footer={footer}
          />
        ) : msg.mediaKind ? (
          // Media (player / document / location) + optional caption, with
          // the footer on its own right-aligned line beneath.
          <div className="flex flex-col">
            <MessageMedia
              mediaKind={msg.mediaKind}
              mediaPath={msg.mediaPath}
              mediaName={msg.mediaName}
              mediaMeta={msg.mediaMeta}
              messageId={msg.id}
              outgoing={outgoing}
            />
            {msg.text && <span className="mt-1 whitespace-pre-wrap break-words">{msg.text}</span>}
            <span className="mt-1 flex justify-end">{footer}</span>
          </div>
        ) : (
          // Text-only: float the footer first so the timestamp tucks to
          // the bottom-right and the text wraps around it (Telegram style).
          <>
            <span className="float-right ml-2 mt-1 translate-y-0.5">{footer}</span>
            <span className="whitespace-pre-wrap break-words">{msg.text}</span>
          </>
        )}
      </div>
    </div>
  );
}

export function AlbumBubble({
  album,
  groupedTop,
  hasTail,
}: {
  album: Extract<RenderItem, { type: "album" }>;
  groupedTop: boolean;
  hasTail: boolean;
}) {
  const openViewer = useImageViewer();
  const outgoing = album.direction === "OUTBOUND";
  const items = album.items;
  const cols = items.length >= 5 ? 3 : 2;
  const gridClass = cols === 3 ? "grid-cols-3" : "grid-cols-2";
  // Use caption from any item that has text (first found).
  const caption = items.find((m) => m.text)?.text ?? null;
  // Footer timestamp from the last message in the album.
  const lastCreatedAt = items[items.length - 1].createdAt;

  const footer = (
    <span
      className="flex select-none items-center gap-1 text-[11px] leading-none text-white"
    >
      {clock(lastCreatedAt)}
      {outgoing && <SentCheck />}
    </span>
  );

  return (
    <div
      className={cn(
        "flex tg-msg-in",
        outgoing ? "justify-end" : "justify-start",
        groupedTop ? "mt-[2px]" : "mt-[10px]",
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-[14px]",
          hasTail && (outgoing ? "rounded-br-[5px]" : "rounded-bl-[5px]"),
        )}
        style={{
          width: 300,
          boxShadow: outgoing ? "0 1px 1px rgba(0,0,0,.06)" : "0 1px 2px rgba(0,0,0,.08)",
        }}
      >
        {/* Tail notch on the album bubble */}
        {hasTail && (
          <Tail outgoing={outgoing} color={outgoing ? TG.outgoing : TG.incoming} />
        )}

        {/* Image grid */}
        <div className={cn("grid gap-[2px]", gridClass)}>
          {items.map((item) => {
            const meta = item.mediaMeta ?? {};
            if (meta.unavailable || meta.oversize || !item.mediaPath) {
              return (
                <div
                  key={item.id}
                  className="aspect-square w-full bg-[color:var(--tg-divider)]"
                />
              );
            }
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openViewer(item.mediaPath!)}
                className="block w-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.mediaPath}
                  alt=""
                  className="aspect-square w-full object-cover"
                />
              </button>
            );
          })}
        </div>

        {/* Caption + footer */}
        {(caption || true) && (
          <div
            className="flex flex-col px-2.5 py-1.5"
            style={{ background: outgoing ? TG.outgoing : TG.incoming }}
          >
            {caption && (
              <span className="whitespace-pre-wrap break-words text-[14px] leading-[1.35] text-[var(--tg-text)]">
                {caption}
              </span>
            )}
            {/* Scrim footer over the last image row */}
            <span className="mt-0.5 flex justify-end">{footer}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// The little bubble tail — a CSS triangle that bridges the tightened
// corner back to a point, matching Telegram's notch.
function Tail({ outgoing, color }: { outgoing: boolean; color: string }) {
  return (
    <span
      aria-hidden
      className="absolute bottom-0"
      style={{
        [outgoing ? "right" : "left"]: -6,
        width: 12,
        height: 16,
        background: color,
        WebkitMaskImage: outgoing ? TAIL_MASK_RIGHT : TAIL_MASK_LEFT,
        maskImage: outgoing ? TAIL_MASK_RIGHT : TAIL_MASK_LEFT,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
      } as React.CSSProperties}
    />
  );
}

// Single tick = "sent". The Telegram Bot API gives no delivery/read
// receipts for business messages, so we deliberately do NOT show the
// double-check (which means "read" in Telegram) — that would be a lie.
function SentCheck() {
  return (
    <svg width="13" height="11" viewBox="0 0 13 11" fill="none" className="inline-block" role="img" aria-label="Юборилди · Sent">
      <title>Юборилди · Sent</title>
      <path d="M1 5.8 L4.4 9 L11.5 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DateSeparator({ iso }: { iso: string }) {
  return (
    <div className="my-3 flex justify-center">
      <span className="rounded-full px-2.5 py-1 text-[12px] font-medium backdrop-blur-sm" style={{ background: "var(--tg-pill-bg)", color: "var(--tg-pill-text)" }}>
        {dateLabel(iso)}
      </span>
    </div>
  );
}

export function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-[60vh] items-center justify-center">{children}</div>;
}
