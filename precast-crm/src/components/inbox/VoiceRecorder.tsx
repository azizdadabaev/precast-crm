"use client";

import { useEffect, useRef, useState } from "react";
import type OpusRecorder from "opus-recorder";
import { Mic, Trash2, Send, Loader2 } from "lucide-react";
import { useT } from "@/lib/i18n";

/**
 * Telegram-style voice recorder for the inbox composer.
 *
 * Records OGG/OPUS via opus-recorder (the format Telegram needs for a real
 * voice-message bubble) and posts it to /api/inbox/[id]/reply-voice, which
 * stage-uploads to get a file_id and sends it over the business connection.
 *
 * The encoder runs in a Web Worker loaded from /opus/encoderWorker.min.js
 * (copied from node_modules at build/setup time). getUserMedia needs a secure
 * context — localhost and https both qualify.
 *
 * UX: a mic button sits in the composer's right slot when there's no text.
 * Tapping it starts recording and overlays a recording bar (cancel · timer ·
 * send) across the whole composer. Cancel discards; send uploads.
 */

const MIN_DURATION_SEC = 1; // ignore accidental taps

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VoiceRecorder({
  conversationId,
  onSent,
}: {
  conversationId: string;
  /** Called after the upload resolves (success or persisted-failure) to refetch the thread. */
  onSent?: () => void;
}) {
  const t = useT();
  const [state, setState] = useState<"idle" | "recording" | "sending">("idle");
  const [seconds, setSeconds] = useState(0);

  const recRef = useRef<OpusRecorder | null>(null);
  const chunksRef = useRef<Uint8Array[]>([]);
  const sendRef = useRef(false);
  const startRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  // Stop a live recording if the component unmounts mid-take.
  useEffect(() => {
    return () => {
      clearTimer();
      try {
        recRef.current?.stop();
      } catch {
        /* recorder already torn down */
      }
    };
  }, []);

  function reset() {
    clearTimer();
    recRef.current = null;
    chunksRef.current = [];
    sendRef.current = false;
    setSeconds(0);
    setState("idle");
  }

  async function start() {
    try {
      const { default: Recorder } = await import("opus-recorder");
      const rec = new Recorder({
        encoderPath: "/opus/encoderWorker.min.js",
        numberOfChannels: 1,
        encoderSampleRate: 48000,
        encoderApplication: 2048, // VOIP — tuned for speech
        streamPages: false, // emit the whole OGG once on stop
      });
      chunksRef.current = [];
      rec.ondataavailable = (typed) => {
        chunksRef.current.push(new Uint8Array(typed));
      };
      rec.onstop = () => handleStop();
      await rec.start(); // prompts for the mic; rejects if denied
      recRef.current = rec;
      startRef.current = performance.now();
      setSeconds(0);
      setState("recording");
      timerRef.current = setInterval(() => {
        setSeconds(Math.floor((performance.now() - startRef.current) / 1000));
      }, 250);
    } catch (err) {
      reset();
      alert(
        `${t("Микрофонга рухсат берилмади", "Microphone access was denied")}${
          err instanceof Error ? `: ${err.message}` : ""
        }`,
      );
    }
  }

  function handleStop() {
    clearTimer();
    const elapsed = Math.round((performance.now() - startRef.current) / 1000);
    const chunks = chunksRef.current;
    const shouldSend = sendRef.current;
    if (!shouldSend || chunks.length === 0 || elapsed < MIN_DURATION_SEC) {
      reset();
      return;
    }
    const blob = new Blob(chunks as BlobPart[], { type: "audio/ogg" });
    void upload(blob, elapsed);
  }

  async function upload(blob: Blob, duration: number) {
    setState("sending");
    try {
      const fd = new FormData();
      fd.append("voice", blob, "voice.ogg");
      fd.append("duration", String(duration));
      const res = await fetch(`/api/inbox/${conversationId}/reply-voice`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const text = await res.text();
      const payload = text ? JSON.parse(text) : {};
      if (!res.ok || payload?.ok === false) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }
    } catch (err) {
      alert(
        `${t("Овозни юбориб бўлмади", "Couldn't send the voice")}${
          err instanceof Error ? `: ${err.message}` : ""
        }`,
      );
    } finally {
      // Refetch either way: a 502 still persisted a failed bubble to show.
      onSent?.();
      reset();
    }
  }

  function finish() {
    sendRef.current = true;
    try {
      recRef.current?.stop();
    } catch {
      reset();
    }
  }

  function cancel() {
    sendRef.current = false;
    try {
      recRef.current?.stop();
    } catch {
      reset();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        aria-label={t("Овоз ёзиш", "Record voice")}
        title={t("Овозли хабар", "Voice message")}
        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-[color:var(--tg-text-dim)] transition-colors hover:text-[var(--tg-accent)]"
      >
        <Mic className="h-5 w-5" />
      </button>

      {state !== "idle" && (
        <div className="absolute inset-0 z-10 flex items-center gap-3 bg-[var(--tg-panel)] px-4">
          <button
            type="button"
            onClick={cancel}
            disabled={state === "sending"}
            aria-label={t("Бекор қилиш", "Cancel")}
            title={t("Бекор қилиш", "Cancel")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--tg-text-dim)] transition-colors hover:text-rose-500 disabled:opacity-40"
          >
            <Trash2 className="h-5 w-5" />
          </button>

          <span className="flex items-center gap-2 text-sm tabular-nums text-[var(--tg-text)]">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse" />
            {fmt(seconds)}
          </span>

          <span className="flex-1 truncate text-xs text-[color:var(--tg-text-dim)]">
            {state === "sending"
              ? t("Юборилмоқда…", "Sending…")
              : t("Ёзиб олинмоқда…", "Recording…")}
          </span>

          <button
            type="button"
            onClick={finish}
            disabled={state === "sending"}
            aria-label={t("Юбориш", "Send")}
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-white transition-transform active:scale-95"
            style={{ background: "var(--tg-accent)" }}
          >
            {state === "sending" ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
      )}
    </>
  );
}
