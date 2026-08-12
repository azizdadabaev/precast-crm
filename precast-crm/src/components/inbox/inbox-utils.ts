/** Pure helpers for the Inbox screen — grouping, time formatting, settings. */

import type { InboxMessage, RenderItem } from "./inbox-types";

export function buildRenderItems(messages: InboxMessage[]): RenderItem[] {
  const renderItems: RenderItem[] = [];
  for (const msg of messages) {
    const gid = msg.mediaGroupId;
    const isAlbumable = gid && (msg.mediaKind === "IMAGE" || msg.mediaKind === "VIDEO");
    const last = renderItems[renderItems.length - 1];
    if (isAlbumable && last && last.type === "album" && last.groupId === gid && last.direction === msg.direction) {
      last.items.push(msg);
    } else if (isAlbumable) {
      renderItems.push({ type: "album", groupId: gid!, direction: msg.direction, items: [msg] });
    } else {
      renderItems.push({ type: "single", msg });
    }
  }
  return renderItems;
}

export function readAutolockMin(): number {
  if (typeof window === "undefined") return 15;
  const raw = localStorage.getItem("inbox.autolockMin");
  const parsed = parseInt(raw ?? "", 10);
  const valid = [0, 5, 15, 30, 60];
  return valid.includes(parsed) ? parsed : 15;
}

export function clock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function sameDay(a: string, b: string): boolean {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

export function dateLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (sameDay(iso, today.toISOString())) return "Bugun · Today";
  if (sameDay(iso, yesterday.toISOString())) return "Kecha · Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// Snippet hints — surface the media kind when the snippet looks empty
// or is a bare placeholder, matching Telegram's "🖼 Photo" list hints.
export function snippet(s: string): string {
  return s && s.trim() ? s : "Хабар · Message";
}
