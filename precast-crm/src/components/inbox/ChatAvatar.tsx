"use client";

/**
 * Telegram-style circular avatar with initials on a deterministic
 * gradient. Telegram derives a peer's color from a hash of its id /
 * name and picks from a fixed palette of gradient pairs — we mirror
 * that so the same contact always renders the same color across the
 * list and the chat header.
 */

// Telegram light-theme peer gradients (top → bottom). Seven pairs,
// matching Telegram Desktop's user-color rotation closely enough to
// read as authentic.
const GRADIENTS: [string, string][] = [
  ["#ff885e", "#ff516a"], // red
  ["#ffcd6a", "#ffa85c"], // orange
  ["#82b1ff", "#665fff"], // violet / blue
  ["#a0de7e", "#54cb68"], // green
  ["#53edd6", "#28c9b7"], // cyan
  ["#72d5fd", "#2a9ef1"], // blue
  ["#e0a2f3", "#d669ed"], // pink
];

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
  const [from, to] = GRADIENTS[hashString(name || "?") % GRADIENTS.length];
  return (
    <span
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: `linear-gradient(180deg, ${from} 0%, ${to} 100%)`,
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}
