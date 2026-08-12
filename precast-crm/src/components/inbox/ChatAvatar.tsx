"use client";

/**
 * Circular avatar with initials, Campsite-style: achromatic. Colour in this
 * system means something (resolved / alert / highlight), so a peer can't own
 * a hue. Identity is still deterministic — a hash of the name picks one of
 * four tones of Ink over the panel, so the same contact reads the same in the
 * list and in the chat header, in either theme.
 */

const TONES = [8, 12, 18, 26] as const;

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
  const tone = TONES[hashString(name || "?") % TONES.length];
  return (
    <span
      className="inline-flex shrink-0 select-none items-center justify-center rounded-[var(--inbox-r-pill)] font-medium text-[color:var(--inbox-ink)] ring-1 ring-[color:var(--inbox-avatar-ring)]"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: `color-mix(in srgb, var(--inbox-ink) ${tone}%, var(--inbox-panel))`,
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
