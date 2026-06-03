// Pure parsing of Telegram Bot API "business" updates into a normalized
// inbound shape. No I/O — fully unit-tested. The webhook route consumes
// these and performs persistence + media download.

export type ParsedMediaKind =
  | "IMAGE" | "VIDEO" | "VIDEO_NOTE" | "VOICE" | "AUDIO" | "DOCUMENT" | "LOCATION" | "OTHER";

export interface ParsedMedia {
  kind: ParsedMediaKind;
  fileId?: string;       // absent for LOCATION and OTHER
  fileName?: string;
  fileSize?: number;
  meta?: Record<string, unknown>;
}

export interface ParsedInbound {
  businessConnectionId: string | null;
  chatId: string;
  telegramMsgId: string;
  mediaGroupId: string | null;
  displayName: string;
  username: string | null;
  text: string | null;
  media: ParsedMedia | null;
  isEdited: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export function classifyMedia(message: any): ParsedMedia | null {
  if (!message || typeof message !== "object") return null;

  if (Array.isArray(message.photo) && message.photo.length) {
    // Telegram sends multiple sizes ascending; pick the largest.
    const largest = [...message.photo].sort(
      (a, b) => (a.file_size ?? 0) - (b.file_size ?? 0),
    )[message.photo.length - 1];
    return { kind: "IMAGE", fileId: largest.file_id, fileSize: largest.file_size };
  }
  if (message.video_note) {
    return {
      kind: "VIDEO_NOTE",
      fileId: message.video_note.file_id,
      fileSize: message.video_note.file_size,
      meta: { duration: message.video_note.duration },
    };
  }
  if (message.video) {
    return {
      kind: "VIDEO",
      fileId: message.video.file_id,
      fileName: message.video.file_name,
      fileSize: message.video.file_size,
      meta: { duration: message.video.duration },
    };
  }
  if (message.animation) {
    // GIF-style MP4 — render as a video.
    return { kind: "VIDEO", fileId: message.animation.file_id, fileSize: message.animation.file_size };
  }
  if (message.voice) {
    return {
      kind: "VOICE",
      fileId: message.voice.file_id,
      fileSize: message.voice.file_size,
      meta: { duration: message.voice.duration },
    };
  }
  if (message.audio) {
    return {
      kind: "AUDIO",
      fileId: message.audio.file_id,
      fileName: message.audio.file_name,
      fileSize: message.audio.file_size,
      meta: { title: message.audio.title },
    };
  }
  if (message.document) {
    return {
      kind: "DOCUMENT",
      fileId: message.document.file_id,
      fileName: message.document.file_name,
      fileSize: message.document.file_size,
    };
  }
  if (message.venue) {
    const loc = message.venue.location ?? {};
    return {
      kind: "LOCATION",
      meta: { lat: loc.latitude, lng: loc.longitude, title: message.venue.title, address: message.venue.address },
    };
  }
  if (message.location) {
    return { kind: "LOCATION", meta: { lat: message.location.latitude, lng: message.location.longitude } };
  }
  // Known-but-unsupported content (sticker, contact, poll, dice, etc.)
  if (message.sticker || message.contact || message.poll || message.dice) {
    return { kind: "OTHER" };
  }
  return null;
}

function pickMessage(update: any): { msg: any; edited: boolean } | null {
  if (update?.business_message) return { msg: update.business_message, edited: false };
  if (update?.edited_business_message) return { msg: update.edited_business_message, edited: true };
  return null;
}

export function parseBusinessUpdate(update: any): ParsedInbound | null {
  const picked = pickMessage(update);
  if (!picked) return null;
  const m = picked.msg;
  const from = m.from ?? {};
  const displayName = [from.first_name, from.last_name].filter(Boolean).join(" ") || "Telegram";
  const media = classifyMedia(m);
  return {
    businessConnectionId: m.business_connection_id ?? null,
    chatId: String(m.chat?.id ?? from.id ?? ""),
    telegramMsgId: String(m.message_id ?? ""),
    mediaGroupId: m.media_group_id ?? null,
    displayName,
    username: from.username ?? null,
    text: m.text ?? m.caption ?? null,
    media,
    isEdited: picked.edited,
  };
}
