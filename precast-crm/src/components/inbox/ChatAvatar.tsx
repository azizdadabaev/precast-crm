"use client";

/**
 * Circular avatar with initials. Identity carries a hue again (Apple's system
 * colours): a hash of the name picks one of the seven --inbox-av-* tones, so
 * the same contact always reads the same in the list and in the chat header,
 * in either theme. The initials stay white on every tone.
 */

const AVATAR_TOKENS = [
  "var(--inbox-av-1)",
  "var(--inbox-av-2)",
  "var(--inbox-av-3)",
  "var(--inbox-av-4)",
  "var(--inbox-av-5)",
  "var(--inbox-av-6)",
  "var(--inbox-av-7)",
] as const;

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ChatAvatar({
  name,
  size = 48,
}: {
  name: string;
  size?: number;
}) {
  const tone = AVATAR_TOKENS[hashString(name || "?") % AVATAR_TOKENS.length];
  return (
    <span
      className="inline-flex shrink-0 select-none items-center justify-center rounded-[var(--inbox-r-pill)] font-medium text-[color:var(--inbox-accent-contrast)] ring-1 ring-[color:var(--inbox-avatar-ring)]"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: tone,
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
