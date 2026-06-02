"use client";

import { MapPin, FileText, Download, AlertCircle } from "lucide-react";

export interface MessageMediaProps {
  mediaKind: string | null;
  mediaPath: string | null;
  mediaName: string | null;
  mediaMeta: Record<string, unknown> | null;
}

export function MessageMedia({ mediaKind, mediaPath, mediaName, mediaMeta }: MessageMediaProps) {
  if (!mediaKind) return null;

  const meta = mediaMeta ?? {};
  if (meta.unavailable) return <Placeholder label="Медиа юкланмади · Media unavailable" />;
  if (meta.oversize) return <Placeholder label="Файл катта — Telegram'да очинг · Too large — open in Telegram" />;

  switch (mediaKind) {
    case "IMAGE":
      return mediaPath ? (
        <a href={mediaPath} target="_blank" rel="noreferrer">
          <img src={mediaPath} alt={mediaName ?? "image"} className="max-w-[260px] rounded-lg" />
        </a>
      ) : null;

    case "VIDEO":
      return mediaPath ? (
        <video src={mediaPath} controls className="max-w-[280px] rounded-lg" />
      ) : null;

    case "VIDEO_NOTE":
      return mediaPath ? (
        <video src={mediaPath} controls className="h-[200px] w-[200px] rounded-full object-cover" />
      ) : null;

    case "VOICE":
    case "AUDIO":
      return mediaPath ? (
        <div className="flex flex-col gap-1">
          {mediaKind === "AUDIO" && meta.title ? (
            <span className="text-xs text-muted-foreground">{String(meta.title)}</span>
          ) : null}
          <audio src={mediaPath} controls className="max-w-[260px]" />
          {typeof meta.duration === "number" ? (
            <span className="text-[10px] text-muted-foreground">{formatDuration(meta.duration)}</span>
          ) : null}
        </div>
      ) : null;

    case "DOCUMENT":
      return mediaPath ? (
        <a
          href={mediaPath}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate max-w-[200px]">{mediaName ?? "document"}</span>
          <Download className="h-4 w-4 shrink-0 opacity-60" />
        </a>
      ) : null;

    case "LOCATION": {
      const lat = meta.lat as number | undefined;
      const lng = meta.lng as number | undefined;
      if (lat == null || lng == null) return null;
      const url = `https://maps.google.com/?q=${lat},${lng}`;
      return (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <span className="flex flex-col">
            <span className="font-medium">{(meta.title as string) ?? "Жойлашув · Location"}</span>
            {meta.address ? <span className="text-xs text-muted-foreground">{String(meta.address)}</span> : null}
            <span className="text-xs text-primary">Open in Google Maps</span>
          </span>
        </a>
      );
    }

    default:
      return <Placeholder label="Қўллаб-қувватланмайди · Unsupported message" />;
  }
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
      <AlertCircle className="h-3.5 w-3.5" />
      {label}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
