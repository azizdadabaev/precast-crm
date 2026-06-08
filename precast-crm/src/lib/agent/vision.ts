// Floor-plan vision orchestration (spec §4.5). Turns extracted room dimensions
// into an ECHO-to-confirm reply — never a quote. A plan can have MULTIPLE rooms
// (the common case for a house); all clearly-read rooms are echoed for the
// customer to confirm in text, after which the normal quote flow runs. A quote is
// never produced off a (possibly misread) sketch. No clear read → escalate.

import type { ExtractedDimensions, ExtractedRoom } from './llm/provider';
import type { ReplyLanguage } from './prompt';

export type VisionDecision =
  | { action: 'reply'; reply: string; rooms: ExtractedRoom[] }
  | { action: 'escalate'; reason: string };

/** Trim trailing zeros: 5.20 → "5.2", 4 → "4". */
function fmt(n: number): string {
  return Number(n.toFixed(2)).toString();
}

function dimsOf(r: ExtractedRoom): string {
  return `${fmt(r.widthM)} × ${fmt(r.lengthM)} m`;
}

function echoText(language: ReplyLanguage, rooms: ExtractedRoom[]): string {
  const list = rooms.map(dimsOf);
  const single = rooms.length === 1;
  switch (language) {
    case 'ru':
      return single
        ? `На плане вижу комнату ~${list[0]} (внутренние размеры). Всё верно? Подтвердите — и я посчитаю.`
        : `На плане вижу ${rooms.length} комнаты: ${list.join(', ')} (внутренние размеры). Всё верно? Подтвердите — и я посчитаю.`;
    case 'uz-cyrillic':
      return single
        ? `Расмда тахминан ${list[0]} хона кўрдим (ички ўлчам). Тўғрими? Тасдиқласангиз, ҳисоблаб бераман.`
        : `Расмда ${rooms.length} та хона кўрдим: ${list.join(', ')} (ички ўлчам). Тўғрими? Тасдиқласангиз, ҳисоблаб бераман.`;
    default: // uz-latin
      return single
        ? `Rasmda taxminan ${list[0]} xona ko'rdim (ichki o'lcham). To'g'rimi? Tasdiqlasangiz, hisoblab beraman.`
        : `Rasmda ${rooms.length} ta xona ko'rdim: ${list.join(', ')} (ichki o'lcham). To'g'rimi? Tasdiqlasangiz, hisoblab beraman.`;
  }
}

/**
 * Dimensions → an echo-to-confirm reply (≥1 clear room) or an escalation
 * (nothing clear). NEVER returns a price: confirmation must precede any
 * calculation (§4.5).
 */
export function buildVisionEcho(dims: ExtractedDimensions, language: ReplyLanguage): VisionDecision {
  if (!dims.found || dims.confidence !== 'high' || dims.rooms.length === 0) {
    return {
      action: 'escalate',
      reason: `floor-plan unclear from image${dims.note ? ` (${dims.note})` : ''} — ask for typed dimensions or hand to a human`,
    };
  }
  return { action: 'reply', reply: echoText(language, dims.rooms), rooms: dims.rooms };
}
