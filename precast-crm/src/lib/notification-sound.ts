"use client";

import { playNewOrderChime } from "@/lib/new-order-chime";

let audioCtx: AudioContext | null = null;
let unlocked = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  try {
    audioCtx = new AC();
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Play a silent 0-duration buffer to satisfy the browser's autoplay
 * policy. Must be called inside a user gesture (click/keydown).
 */
export function unlockAudio() {
  if (unlocked) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    unlocked = true;
  } catch { /* AudioContext not available — silently ignore */ }
}

/**
 * Play the notification sound. Prefers a static mp3 in /public/sounds,
 * falls back to the synthesized chime in new-order-chime.ts if the
 * file is missing or playback is blocked.
 */
export function playNotificationSound() {
  if (!unlocked) {
    // Still try the synth — it's safe-noop when AudioContext is locked.
    try { playNewOrderChime(); } catch { /* ignore */ }
    return;
  }
  try {
    const audio = new Audio("/sounds/notification.mp3");
    audio.volume = 0.6;
    audio.play().catch(() => {
      // mp3 missing or autoplay still blocked — fall back to synth.
      try { playNewOrderChime(); } catch { /* ignore */ }
    });
  } catch {
    try { playNewOrderChime(); } catch { /* ignore */ }
  }
}
