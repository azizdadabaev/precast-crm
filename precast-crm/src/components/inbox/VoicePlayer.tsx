"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

/**
 * Telegram-style voice / audio player.
 *
 * The Bot API gives us no amplitude data for voice notes, so the
 * waveform is *synthesized* deterministically from the message id: a
 * tiny seeded PRNG produces stable bar heights that never reshuffle
 * across renders. Played bars fill left → right as the hidden <audio>
 * element progresses.
 */

const BAR_COUNT = 44;

// Colors are CSS variables so they flip with the app's dark mode. The player
// lives inside a bubble, so it takes its colours from the direction: systemBlue
// on the incoming (neutral) fill, inverted to white on the blue outgoing fill.
const ACCENT = "var(--inbox-accent)";
const ACCENT_CONTRAST = "var(--inbox-accent-contrast)";
const BUBBLE_OUT = "var(--inbox-bubble-out)";
const TEXT_OUT = "var(--inbox-bubble-out-text)";
const META_OUT = "var(--inbox-bubble-out-meta)";
// No token exists for a dimmed white, so the unplayed bars on the blue fill are
// derived from the bubble's own text colour rather than a new hard-coded value.
const UNPLAYED_OUT = "color-mix(in srgb, var(--inbox-bubble-out-text) 40%, transparent)";

function seeded(seed: number): () => number {
  // mulberry32 — small, fast, deterministic.
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h << 5) - h + id.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) || 1;
}

function buildWaveform(id: string): number[] {
  const rand = seeded(hashId(id));
  return Array.from({ length: BAR_COUNT }, () => {
    // Heights 0.3–1.0; bias toward the middle for a natural envelope.
    const base = 0.3 + rand() * 0.7;
    return Math.min(1, base);
  });
}

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VoicePlayer({
  id,
  src,
  duration,
  title,
  outgoing,
}: {
  id: string;
  src: string;
  duration?: number;
  title?: string;
  /** True inside an OUTBOUND (systemBlue) bubble — inverts the player's tint. */
  outgoing: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(duration ?? 0);

  const bars = useMemo(() => buildWaveform(id), [id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrent(audio.currentTime);
    const onMeta = () => {
      if (Number.isFinite(audio.duration)) setTotal(audio.duration);
    };
    const onEnd = () => {
      setPlaying(false);
      setCurrent(0);
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const el = waveRef.current;
    if (!audio || !el || !total) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * total;
    setCurrent(audio.currentTime);
  };

  const seekByKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !total) return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const delta = e.key === "ArrowRight" ? 5 : -5;
    audio.currentTime = Math.min(total, Math.max(0, audio.currentTime + delta));
    setCurrent(audio.currentTime);
  };

  const progress = total > 0 ? current / total : 0;
  // Time label: count up while playing / scrubbed, show total when idle.
  const label = current > 0 ? fmt(current) : fmt(total);
  const played = outgoing ? TEXT_OUT : ACCENT;
  const unplayed = outgoing ? UNPLAYED_OUT : "var(--inbox-silver)";

  return (
    <div className="flex flex-col gap-2">
      {title ? (
        <span
          className="truncate text-[13px] font-medium"
          style={{ color: outgoing ? TEXT_OUT : "var(--inbox-bubble-in-text)" }}
          title={title}
        >
          {title}
        </span>
      ) : null}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--inbox-r-pill)] shadow-[var(--inbox-shadow-sm)] transition-transform active:scale-95"
          style={{
            background: outgoing ? TEXT_OUT : ACCENT,
            color: outgoing ? BUBBLE_OUT : ACCENT_CONTRAST,
          }}
        >
          {playing ? (
            <Pause className="h-5 w-5" fill="currentColor" strokeWidth={0} />
          ) : (
            <Play className="ml-0.5 h-5 w-5" fill="currentColor" strokeWidth={0} />
          )}
        </button>

        <div className="flex min-w-[140px] flex-col gap-1">
          <div
            ref={waveRef}
            onClick={seek}
            onKeyDown={seekByKey}
            className="flex h-7 cursor-pointer items-center gap-[2px]"
            role="slider"
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(total)}
            aria-valuenow={Math.round(current)}
            tabIndex={0}
          >
            {bars.map((h, i) => {
              const filled = i / BAR_COUNT <= progress;
              return (
                <span
                  key={i}
                  className="flex-1 rounded-[var(--inbox-r-pill)] transition-colors"
                  style={{
                    height: `${Math.round(h * 100)}%`,
                    minHeight: 3,
                    background: filled ? played : unplayed,
                  }}
                />
              );
            })}
          </div>
          <span
            className="text-[11px] font-medium leading-[1.4] tabular-nums"
            style={{ color: outgoing ? META_OUT : "var(--inbox-steel)" }}
          >
            {label}
          </span>
        </div>
      </div>
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
    </div>
  );
}
