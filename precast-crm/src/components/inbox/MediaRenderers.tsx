"use client";

import { useRef, useState } from "react";
import { MapPin, FileText, Download, AlertCircle, Play } from "lucide-react";
import { VoicePlayer } from "./VoicePlayer";
import { useImageViewer } from "./ImageViewer";

export interface MessageMediaProps {
  mediaKind: string | null;
  mediaPath: string | null;
  mediaName: string | null;
  mediaMeta: Record<string, unknown> | null;
  /** Stable id of the owning message — seeds the voice waveform. */
  messageId?: string;
  /** True when this bubble is OUTBOUND (changes player tinting). */
  outgoing?: boolean;
  /**
   * Timestamp/ticks node. Image & video overlay it on a dark scrim
   * (Telegram style); other media let the bubble render it below.
   */
  footer?: React.ReactNode;
}

const ACCENT = "var(--tg-accent)";

export function MessageMedia({
  mediaKind,
  mediaPath,
  mediaName,
  mediaMeta,
  messageId,
  outgoing = false,
  footer,
}: MessageMediaProps) {
  const openViewer = useImageViewer();

  if (!mediaKind) return null;

  const meta = mediaMeta ?? {};
  if (meta.unavailable) return <Placeholder label="Медиа юкланмади · Media unavailable" />;
  if (meta.oversize)
    return <Placeholder label="Файл катта — Telegram'да очинг · Too large — open in Telegram" />;

  switch (mediaKind) {
    case "IMAGE":
      return mediaPath ? (
        <button type="button" onClick={() => openViewer([mediaPath], 0)} className="group relative block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaPath}
            alt={mediaName ?? "image"}
            className="block max-h-[210px] max-w-[180px] rounded-[14px] object-cover"
          />
          {footer ? <MediaScrimFooter>{footer}</MediaScrimFooter> : null}
        </button>
      ) : null;

    case "VIDEO":
      return mediaPath ? <VideoPlayer src={mediaPath} footer={footer} /> : null;

    case "VIDEO_NOTE":
      return mediaPath ? <VideoNote src={mediaPath} footer={footer} /> : null;

    case "VOICE":
    case "AUDIO":
      return mediaPath ? (
        <VoicePlayer
          id={messageId ?? mediaPath}
          src={mediaPath}
          outgoing={outgoing}
          duration={typeof meta.duration === "number" ? meta.duration : undefined}
          title={mediaKind === "AUDIO" && meta.title ? String(meta.title) : undefined}
        />
      ) : null;

    case "DOCUMENT":
      return mediaPath ? (
        <a
          href={mediaPath}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 py-0.5 pr-1"
        >
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white"
            style={{ background: ACCENT }}
          >
            <FileText className="h-5 w-5" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="max-w-[200px] truncate text-[14px] font-medium text-[var(--tg-text)]">
              {mediaName ?? "document"}
            </span>
            <span className="inline-flex items-center gap-1 text-[12px] text-[color:var(--tg-text-dim)]">
              <Download className="h-3 w-3" />
              {fileHint(mediaName, meta)}
            </span>
          </span>
        </a>
      ) : null;

    case "LOCATION": {
      const lat = meta.lat as number | undefined;
      const lng = meta.lng as number | undefined;
      if (lat == null || lng == null) return null;
      const url = `https://maps.google.com/?q=${lat},${lng}`;
      return (
        <a href={url} target="_blank" rel="noreferrer" className="block w-[260px] overflow-hidden rounded-[12px]">
          <MapTexture lat={lat} lng={lng} />
          <span className="flex flex-col px-2 pb-1 pt-1.5">
            <span className="text-[14px] font-medium text-[var(--tg-text)]">
              {(meta.title as string) ?? "Жойлашув · Location"}
            </span>
            {meta.address ? (
              <span className="text-[12px] text-[color:var(--tg-text-dim)]">{String(meta.address)}</span>
            ) : null}
            <span className="mt-0.5 text-[12px] font-medium" style={{ color: ACCENT }}>
              Open in Google Maps
            </span>
          </span>
        </a>
      );
    }

    default:
      return <Placeholder label="Қўллаб-қувватланмайди · Unsupported message" />;
  }
}

/* ── Video ────────────────────────────────────────────────────────── */

function VideoPlayer({ src, footer }: { src: string; footer?: React.ReactNode }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  return (
    <div className="group relative block max-w-[320px] overflow-hidden rounded-[14px]">
      <video
        ref={ref}
        src={src}
        playsInline
        controls={started}
        onPlay={() => setStarted(true)}
        className="block max-h-[360px] w-full rounded-[14px] object-cover"
      />
      {!started && (
        <button
          type="button"
          aria-label="Play video"
          onClick={() => {
            setStarted(true);
            void ref.current?.play();
          }}
          className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors hover:bg-black/15"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/45 backdrop-blur-sm">
            <Play className="ml-1 h-7 w-7 text-white" fill="currentColor" strokeWidth={0} />
          </span>
        </button>
      )}
      {!started && footer ? <MediaScrimFooter>{footer}</MediaScrimFooter> : null}
    </div>
  );
}

function VideoNote({ src, footer }: { src: string; footer?: React.ReactNode }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);
  return (
    <div className="relative h-[200px] w-[200px]">
      <video
        ref={ref}
        src={src}
        playsInline
        controls={false}
        onClick={() => {
          const v = ref.current;
          if (!v) return;
          if (v.paused) {
            void v.play();
            setStarted(true);
          } else {
            v.pause();
          }
        }}
        className="h-[200px] w-[200px] cursor-pointer rounded-full object-cover ring-2 ring-black/5"
      />
      {!started && (
        <button
          type="button"
          aria-label="Play video note"
          onClick={(e) => {
            e.stopPropagation();
            setStarted(true);
            void ref.current?.play();
          }}
          className="absolute inset-0 flex items-center justify-center rounded-full bg-black/10 hover:bg-black/15"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/45">
            <Play className="ml-1 h-6 w-6 text-white" fill="currentColor" strokeWidth={0} />
          </span>
        </button>
      )}
      {footer ? (
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/40 px-2 py-0.5">
          {footer}
        </span>
      ) : null}
    </div>
  );
}

/* ── Shared pieces ────────────────────────────────────────────────── */

// Bottom-right timestamp on a soft dark gradient, Telegram-style.
function MediaScrimFooter({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute bottom-0 right-0 left-0 flex justify-end rounded-b-[14px] bg-gradient-to-t from-black/45 to-transparent px-2 pb-1.5 pt-6 text-white">
      {children}
    </span>
  );
}

// A faux map: layered gradients give a subtle "satellite-ish" texture
// with a grid of faint roads and a centered pin. No external tiles.
function MapTexture({ lat, lng }: { lat: number; lng: number }) {
  // Nudge the pin a touch based on the coords so different locations
  // don't look pixel-identical.
  const dx = ((Math.abs(lng) * 37) % 30) - 15;
  const dy = ((Math.abs(lat) * 37) % 24) - 12;
  return (
    <div
      className="relative h-[120px] w-full"
      style={{
        background:
          "linear-gradient(135deg, #cfe0c3 0%, #e3e9d6 45%, #d7e3ea 100%)",
        backgroundColor: "#dde3d8",
      }}
    >
      {/* faint road grid */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
          backgroundSize: "26px 26px",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(115deg, transparent 46%, rgba(255,255,255,.55) 47%, rgba(255,255,255,.55) 49%, transparent 50%)",
        }}
      />
      <span
        className="absolute left-1/2 top-1/2"
        style={{ transform: `translate(calc(-50% + ${dx}px), calc(-60% + ${dy}px))` }}
      >
        <MapPin className="h-7 w-7 fill-[#e24b4b] text-white drop-shadow" />
      </span>
    </div>
  );
}

function fileHint(name: string | null, meta: Record<string, unknown>): string {
  const ext = name?.split(".").pop();
  const size = typeof meta.size === "number" ? formatBytes(meta.size) : null;
  const extLabel = ext && ext.length <= 5 ? ext.toUpperCase() : "FILE";
  return size ? `${extLabel} · ${size}` : extLabel;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-[10px] border border-[color:var(--tg-divider)] px-3 py-2 text-[12px] text-[color:var(--tg-text-dim)]">
      <AlertCircle className="h-3.5 w-3.5" />
      {label}
    </div>
  );
}
