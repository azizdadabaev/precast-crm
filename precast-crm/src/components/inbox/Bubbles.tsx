"use client";

import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MessageMedia } from "@/components/inbox/MediaRenderers";
import { useImageViewer } from "@/components/inbox/ImageViewer";
import type { InboxMessage, RenderItem } from "./inbox-types";
import { clock, dateLabel } from "./inbox-utils";

// Direction reads from hue, iMessage-style: ours is systemBlue, theirs is a
// neutral fill. Because the outgoing fill is saturated, EVERY piece of text
// inside a bubble has to pick its colour from the direction — body, caption,
// timestamp and check all read from the -text / -meta pair below.
const BUBBLE_IN = "var(--inbox-bubble-in)";
const BUBBLE_OUT = "var(--inbox-bubble-out)";
const TEXT_IN = "var(--inbox-bubble-in-text)";
const TEXT_OUT = "var(--inbox-bubble-out-text)";
const META_OUT = "var(--inbox-bubble-out-meta)";
const META_IN = "var(--inbox-steel)";

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
      className={cn("flex select-none items-center gap-1 text-[11px] leading-[1.4]", overlayMedia && "text-white")}
      style={
        overlayMedia
          ? undefined
          : {
              // On the blue outgoing fill even the failure marker has to stay
              // white — the red hairline border carries "failed" instead.
              color: outgoing ? META_OUT : msg.failed ? "var(--inbox-alert)" : META_IN,
            }
      }
    >
      {clock(msg.createdAt)}
      {outgoing && !msg.failed && <SentCheck />}
      {msg.failed && <span className="font-medium">! · юборилмади</span>}
    </span>
  );

  return (
    <div
      className={cn(
        "group flex items-center gap-1 inbox-msg-in",
        outgoing ? "justify-end" : "justify-start",
        groupedTop ? "mt-[4px]" : "mt-[8px]",
      )}
    >
      {outgoing && onDelete && (
        <button
          type="button"
          onClick={() => onDelete(msg.id)}
          title="Ўчириш · Delete"
          aria-label="Delete message"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--inbox-r-pill)] text-[color:var(--inbox-steel)] opacity-0 transition-colors hover:bg-[var(--inbox-hover)] hover:text-[color:var(--inbox-alert)] group-hover:opacity-100"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      <div
        className={cn(
          "relative max-w-[min(72%,600px)] text-[15px] leading-[1.56]",
          // Media-only bubbles are the image itself — it carries its own
          // radius, so no card chrome around it.
          overlayMedia ? "overflow-hidden" : "rounded-[var(--inbox-r-card)] border border-[color:var(--inbox-border)] px-3 py-2",
          // The last bubble of a run tightens its inner corner so a group
          // still reads as one block (Campsite has no tails).
          !overlayMedia && hasTail && (outgoing ? "rounded-br-[var(--inbox-r-badge)]" : "rounded-bl-[var(--inbox-r-badge)]"),
          msg.failed && "border border-[color:var(--inbox-alert)]",
        )}
        style={{
          background: overlayMedia ? "transparent" : outgoing ? BUBBLE_OUT : BUBBLE_IN,
          // The hairline is the fill's own colour on outgoing, so a light
          // separator never outlines the blue.
          borderColor: msg.failed
            ? "var(--inbox-alert)"
            : outgoing
              ? BUBBLE_OUT
              : "var(--inbox-border)",
          color: outgoing ? TEXT_OUT : TEXT_IN,
          boxShadow: overlayMedia ? "none" : "var(--inbox-shadow-sm)",
        }}
      >
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
    // The album footer sits on the caption strip (not on a scrim), so it takes
    // the strip's own direction colours rather than a flat white.
    <span
      className="flex select-none items-center gap-1 text-[11px] leading-[1.4]"
      style={{ color: outgoing ? META_OUT : META_IN }}
    >
      {clock(lastCreatedAt)}
      {outgoing && <SentCheck />}
    </span>
  );

  return (
    <div
      className={cn(
        "flex inbox-msg-in",
        outgoing ? "justify-end" : "justify-start",
        groupedTop ? "mt-[4px]" : "mt-[8px]",
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-[var(--inbox-r-card)] border border-[color:var(--inbox-border)]",
          hasTail && (outgoing ? "rounded-br-[var(--inbox-r-badge)]" : "rounded-bl-[var(--inbox-r-badge)]"),
        )}
        style={{ width: 300, boxShadow: "var(--inbox-shadow-sm)" }}
      >
        {/* Image grid */}
        <div className={cn("grid gap-[2px]", gridClass)}>
          {items.map((item) => {
            const meta = item.mediaMeta ?? {};
            if (meta.unavailable || meta.oversize || !item.mediaPath) {
              return (
                <div
                  key={item.id}
                  className="aspect-square w-full bg-[color:var(--inbox-surface-3)]"
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
            className="flex flex-col px-3 py-2"
            style={{
              background: outgoing ? BUBBLE_OUT : BUBBLE_IN,
              color: outgoing ? TEXT_OUT : TEXT_IN,
            }}
          >
            {caption && (
              <span className="whitespace-pre-wrap break-words text-[15px] leading-[1.56]">
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
    <div className="my-4 flex justify-center">
      <span
        className="rounded-[var(--inbox-r-pill)] border border-[color:var(--inbox-border)] px-3 py-1 text-[11px] font-medium leading-[1.4]"
        style={{ background: "var(--inbox-surface-2)", color: "var(--inbox-steel)" }}
      >
        {dateLabel(iso)}
      </span>
    </div>
  );
}

// The Inbox's own centred shell (lock screen, loading). Carries the
// Campsite type scope so those screens match the rest of the Inbox.
export function Centered({ children }: { children: React.ReactNode }) {
  return <div className="inbox-campsite flex h-[60vh] items-center justify-center">{children}</div>;
}
