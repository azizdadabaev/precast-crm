// Floor-plan vision orchestration (spec §4.5). Turns extracted dimensions into an
// ECHO-to-confirm reply — never a quote. The customer confirms the dimensions in
// text, and only then does the normal typed-dimension quote flow run; a quote is
// never produced off a (possibly misread) sketch. Low/no confidence → escalate
// (ask for typed dimensions or hand to a human).

import type { ExtractedDimensions } from './llm/provider';
import type { ReplyLanguage } from './prompt';

export type VisionDecision =
  | { action: 'reply'; reply: string; innerWidthM: number; innerLengthM: number }
  | { action: 'escalate'; reason: string };

/** Trim trailing zeros: 5.20 → "5.2", 4 → "4". */
function fmt(n: number): string {
  return Number(n.toFixed(2)).toString();
}

function echoText(language: ReplyLanguage, w: number, l: number): string {
  const dims = `${fmt(w)} × ${fmt(l)} m`;
  switch (language) {
    case 'ru':
      return `На плане вижу комнату ~${dims} (внутренние размеры). Всё верно? Подтвердите — и я посчитаю.`;
    case 'uz-cyrillic':
      return `Расмда тахминан ${dims} хона кўрдим (ички ўлчам). Тўғрими? Тасдиқласангиз, ҳисоблаб бераман.`;
    default: // uz-latin
      return `Rasmda taxminan ${dims} xona ko'rdim (ichki o'lcham). To'g'rimi? Tasdiqlasangiz, hisoblab beraman.`;
  }
}

/**
 * Dimensions → an echo-to-confirm reply (clear read) or an escalation (unclear).
 * NEVER returns a price: confirmation must precede any calculation (§4.5).
 */
export function buildVisionEcho(dims: ExtractedDimensions, language: ReplyLanguage): VisionDecision {
  if (!dims.found || dims.confidence !== 'high' || dims.innerWidthM == null || dims.innerLengthM == null) {
    return {
      action: 'escalate',
      reason: `floor-plan unclear from image${dims.note ? ` (${dims.note})` : ''} — ask for typed dimensions or hand to a human`,
    };
  }
  return {
    action: 'reply',
    reply: echoText(language, dims.innerWidthM, dims.innerLengthM),
    innerWidthM: dims.innerWidthM,
    innerLengthM: dims.innerLengthM,
  };
}
