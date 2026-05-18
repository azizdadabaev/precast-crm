# Notification sounds

Drop a `notification.mp3` here — a short (0.5–1 s) gentle chime, ~60-70 dB.

If the file is missing, `src/lib/notification-sound.ts` transparently falls
back to the synthesized Web Audio chime in `src/lib/new-order-chime.ts`,
so the absence of an mp3 is not fatal.
