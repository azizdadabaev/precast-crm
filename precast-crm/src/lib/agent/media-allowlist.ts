// Strict inbound-media allowlist for the Telegram AI agent (spec §7).
// The bot only ever fetches/processes: text, voice notes, images (jpg/png), PDF.
// Everything else is handed to a human or refused outright. This module is the
// front-door gate; it never downloads bytes — it decides from message metadata.

export type TelegramMediaKind =
  | 'text'
  | 'voice'
  | 'photo'
  | 'video'
  | 'video_note'
  | 'audio'
  | 'document'
  | 'animation'
  | 'sticker'
  | 'contact'
  | 'location'
  | 'other';

export interface InboundMedia {
  kind: TelegramMediaKind;
  mimeType?: string; // present for document / audio / voice / video
  fileName?: string; // present for document
  fileSize?: number; // bytes, when Telegram provides it
}

export type MediaDecision =
  | { action: 'pass' } // no file to process (text, contact, location, sticker)
  | { action: 'process'; as: 'image' | 'pdf' } // safe to download + read
  | { action: 'transcribe' } // voice note -> speech-to-text
  | { action: 'escalate'; reason: string } // hand to a human, do NOT process
  | { action: 'reject'; reason: string }; // never download/open

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_PDF_BYTES = 16 * 1024 * 1024; // 16 MB
const MAX_VOICE_BYTES = 16 * 1024 * 1024; // 16 MB

const ALLOWED_IMAGE_MIMES = new Set(['image/jpeg', 'image/png']);
const ALLOWED_IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png']);

export function classifyInboundMedia(m: InboundMedia): MediaDecision {
  switch (m.kind) {
    case 'text':
    case 'contact':
    case 'location':
    case 'sticker':
      return { action: 'pass' };

    case 'photo':
      if (m.fileSize != null && m.fileSize > MAX_IMAGE_BYTES)
        return { action: 'escalate', reason: 'image too large' };
      return { action: 'process', as: 'image' };

    case 'voice':
      if (m.fileSize != null && m.fileSize > MAX_VOICE_BYTES)
        return { action: 'escalate', reason: 'voice note too large' };
      return { action: 'transcribe' };

    case 'video':
    case 'video_note':
    case 'animation':
    case 'audio':
      return { action: 'escalate', reason: `${m.kind} is handed to a human, never processed by the bot` };

    case 'document':
      return classifyDocument(m);

    case 'other':
    default:
      return { action: 'escalate', reason: 'unknown media kind' };
  }
}

function classifyDocument(m: InboundMedia): MediaDecision {
  const mime = (m.mimeType ?? '').toLowerCase();
  const ext = extensionOf(m.fileName);

  // PDF: mime AND extension must both say pdf.
  if (mime === 'application/pdf' && ext === 'pdf') {
    if (m.fileSize != null && m.fileSize > MAX_PDF_BYTES)
      return { action: 'escalate', reason: 'pdf too large' };
    return { action: 'process', as: 'pdf' };
  }

  // Image sent as a file: mime AND extension must both be an allowed image.
  if (ALLOWED_IMAGE_MIMES.has(mime) && ALLOWED_IMAGE_EXTS.has(ext)) {
    if (m.fileSize != null && m.fileSize > MAX_IMAGE_BYTES)
      return { action: 'escalate', reason: 'image too large' };
    return { action: 'process', as: 'image' };
  }

  // Everything else (.apk, archives, executables, office docs, unknown types,
  // or any mime/extension mismatch) is NEVER opened.
  return { action: 'reject', reason: `disallowed document type (ext=${ext || 'none'}, mime=${mime || 'none'})` };
}

function extensionOf(fileName?: string): string {
  if (!fileName) return '';
  const dot = fileName.lastIndexOf('.');
  if (dot < 0 || dot === fileName.length - 1) return '';
  return fileName.slice(dot + 1).toLowerCase();
}
