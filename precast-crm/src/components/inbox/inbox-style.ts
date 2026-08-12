/** Inline style constants for the Inbox screen (Telegram chrome). */

// Telegram theme colors are expressed as CSS variables (defined in globals.css)
// so they flip automatically with the app's dark mode. Use CSS var() strings
// in inline styles and Tailwind arbitrary-value classes.
export const TG = {
  wallpaper: "var(--tg-wallpaper)",
  incoming: "var(--tg-bubble-in)",
  outgoing: "var(--tg-bubble-out)",
  accent: "var(--tg-accent)",
};

/* ── Telegram chat wallpaper ──────────────────────────────────────────
   A faint repeating doodle over a soft blue-gray base. The pattern is a
   low-opacity inline SVG data-URI so bubbles always pop above it. */
const WALLPAPER_SVG = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'>
    <g fill='none' stroke='#9fb0bd' stroke-width='2' stroke-linecap='round' opacity='0.18'>
      <circle cx='24' cy='24' r='9'/>
      <path d='M70 18 q10 8 0 18 q-10 8 0 18'/>
      <path d='M96 70 l8 8 m0 -8 l-8 8'/>
      <circle cx='30' cy='90' r='6'/>
      <path d='M58 78 h20 m-10 -10 v20'/>
      <path d='M10 60 q12 -10 24 0 t24 0'/>
      <rect x='86' y='14' width='16' height='16' rx='4'/>
    </g>
  </svg>`,
);
export const WALLPAPER_PATTERN = `url("data:image/svg+xml,${WALLPAPER_SVG}")`;

/* ── Bubble tail masks (SVG shapes carving the notch) ─────────────── */
const TAIL_RIGHT_SVG = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='12' height='16' viewBox='0 0 12 16'><path d='M0 0 C0 8 0 12 8 16 C2 16 0 14 0 10 Z' fill='black'/></svg>`,
);
const TAIL_LEFT_SVG = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='12' height='16' viewBox='0 0 12 16'><path d='M12 0 C12 8 12 12 4 16 C10 16 12 14 12 10 Z' fill='black'/></svg>`,
);
export const TAIL_MASK_RIGHT = `url("data:image/svg+xml,${TAIL_RIGHT_SVG}")`;
export const TAIL_MASK_LEFT = `url("data:image/svg+xml,${TAIL_LEFT_SVG}")`;

/* ── Message entrance animation ───────────────────────────────────── */
export const TELEGRAM_CSS = `
@keyframes tg-pop {
  from { opacity: 0; transform: translateY(6px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.tg-msg-in { animation: tg-pop 180ms cubic-bezier(0.22, 1, 0.36, 1); }
@media (prefers-reduced-motion: reduce) { .tg-msg-in { animation: none; } }
`;
