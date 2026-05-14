// Minimal, cute new-order notification chime.
//
// Why synthesized rather than an audio file:
//   - Zero bundle weight (no .mp3/.ogg to ship)
//   - No licensing headaches around using a stock sample
//   - Easy to tweak the pitch/volume from one place
//
// The chime is a two-note marimba-ish blip: a soft sine wave at C6 (1046 Hz)
// followed half a beat later by E6 (1318 Hz). Each note has a sharp attack
// and a gentle decay so it reads as "ping" rather than "beep." Volume is
// capped at 12% so it sits in the background even on speakers cranked up
// for podcasts.
//
// Web Audio rules of the road:
//   - AudioContext creation requires a user gesture in modern browsers.
//     We lazy-create on the first call and reuse the same context.
//   - If autoplay is blocked (no gesture yet), .resume() rejects silently;
//     we swallow the error so the polling loop doesn't crash.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  // Some older browsers expose AudioContext under webkit prefix.
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

function playNote(
  audio: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  gain: number,
): void {
  const osc = audio.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;

  const g = audio.createGain();
  // Sharp attack (5ms), exponential decay over the note duration.
  // exponentialRampToValueAtTime requires a non-zero target.
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(gain, startAt + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  osc.connect(g).connect(audio.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

/**
 * Play the new-order chime. Safe to call from any context; silently
 * no-ops if the browser hasn't unlocked AudioContext yet.
 */
export function playNewOrderChime(): void {
  const audio = getCtx();
  if (!audio) return;
  // .resume() is a promise but we don't need to await — note scheduling
  // is by absolute time, so the chime plays when the context is ready.
  audio.resume().catch(() => {});

  const now = audio.currentTime;
  const peak = 0.12; // soft — see file header comment
  playNote(audio, 1046.5, now, 0.22, peak);          // C6
  playNote(audio, 1318.5, now + 0.12, 0.28, peak);   // E6 (overlaps slightly)
}
