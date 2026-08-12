/** Inline style constants for the Inbox screen (Campsite design system). */

/* ── Message entrance animation ─────────────────────────────────────
   Campsite is restrained about motion: 150ms on colour/background only,
   and a short fade-up as a message lands. No layout motion. */
export const INBOX_CSS = `
@keyframes inbox-pop {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
.inbox-msg-in { animation: inbox-pop 150ms ease; }
@media (prefers-reduced-motion: reduce) { .inbox-msg-in { animation: none; } }
`;
