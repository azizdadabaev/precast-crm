// Floor-plan vision orchestration (spec §4.5).
//
// Gemini's vision read is accurate enough that we now PROCEED without a confirm
// step: when rooms are read clearly, this module renders them as a customer-style
// dimensions message that flows through the normal text pipeline (quote → short
// price → conversation-linked draft → 1:1 image), exactly like typed dimensions.
// The quote stays grounded — the agent calls get_quote on the dimensions; vision
// only supplies them. When nothing is readable, it returns a friendly ask for
// typed dimensions.

import type { ExtractedRoom } from './llm/provider';
import type { ReplyLanguage } from './prompt';

/** Trim trailing zeros: 5.20 → "5.2", 4 → "4". */
function fmt(n: number): string {
  return Number(n.toFixed(2)).toString();
}

function dimsOf(r: ExtractedRoom): string {
  return `${fmt(r.widthM)}×${fmt(r.lengthM)} m`;
}

/**
 * Render the rooms read from a floor plan as a customer-style dimensions message
 * in the conversation language. It's stored on the image message and fed to the
 * normal text agent, so a floor plan is handled exactly like typed dimensions.
 * Ends with a price ask so the quote path reliably triggers.
 */
export function describeExtractedRooms(rooms: ExtractedRoom[], language: ReplyLanguage): string {
  const list = rooms.map(dimsOf).join(', ');
  switch (language) {
    case 'ru':
      return `Размеры комнат с чертежа: ${list}. Сколько стоит?`;
    case 'uz-cyrillic':
      return `Расмдаги хона ўлчамлари: ${list}. Нархи қанча?`;
    default: // uz-latin
      return `Rasmdagi xona o'lchamlari: ${list}. Narxi qancha?`;
  }
}

/**
 * Follow-up line sent AFTER the calculation image when the dimensions were
 * EXTRACTED (drawing/voice), not typed — so the customer can correct a misread.
 * Lists the dimensions used and invites a typed correction → recalculation. Only
 * for media inputs; typed dimensions don't need it (the customer typed them).
 */
export function mediaCorrectionNote(
  rooms: ReadonlyArray<{ innerWidth: number; innerLength: number }>,
  language: ReplyLanguage,
  source: 'image' | 'voice',
): string {
  const list = rooms.map((r) => `${fmt(r.innerWidth)}×${fmt(r.innerLength)} m`).join(', ');
  switch (language) {
    case 'ru':
      return source === 'image'
        ? `На чертеже я увидел такие размеры: ${list}. Если что-то не так — пришлите размеры текстом, и я пересчитаю.`
        : `Из голосового я понял такие размеры: ${list}. Если что-то не так — пришлите размеры текстом, и я пересчитаю.`;
    case 'uz-cyrillic':
      return source === 'image'
        ? `Чизмадан қуйидаги ўлчамларни кўрдим: ${list}. Агар хато бўлса, ўлчамларни ёзиб юборинг — қайтадан ҳисоблаб берамиз.`
        : `Овозли хабардан қуйидаги ўлчамларни олдим: ${list}. Агар хато бўлса, ўлчамларни ёзиб юборинг — қайтадан ҳисоблаб берамиз.`;
    default: // uz-latin
      return source === 'image'
        ? `Chizmadan quyidagi o'lchamlarni ko'rdim: ${list}. Agar xato bo'lsa, o'lchamlarni yozib yuboring — qaytadan hisoblab beramiz.`
        : `Ovozli xabardan quyidagi o'lchamlarni oldim: ${list}. Agar xato bo'lsa, o'lchamlarni yozib yuboring — qaytadan hisoblab beramiz.`;
  }
}

/**
 * The rooms whose width AND length both appear as numbers in the media's own
 * text (voice transcript / vision read). The correction note claims "from the
 * voice note I took…", so it may only list sizes that voice note carried — live
 * bug 0575D: a delivery-question voice note got "Ovozli xabardan … 4×7, 4×6,
 * 4×4.8", sizes that came from earlier messages. Pure.
 */
export function roomsStatedIn<R extends { innerWidth: number; innerLength: number }>(
  rooms: ReadonlyArray<R>,
  mediaText: string,
): R[] {
  const said = (mediaText.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(',', '.')));
  const has = (v: number) => said.some((n) => Math.abs(n - v) < 0.005);
  return rooms.filter((r) => has(r.innerWidth) && has(r.innerLength));
}

/** Friendly ask for typed dimensions when the plan can't be read clearly. */
export function visionFallbackReply(language: ReplyLanguage): string {
  switch (language) {
    case 'ru':
      return 'Не смог точно прочитать чертёж 🙏 Напишите ширину и длину комнаты (например 4×5 m), и я сразу посчитаю.';
    case 'uz-cyrillic':
      return 'Расмни аниқ ўқий олмадим 🙏 Хонангиз эни ва бўйини (масалан 4×5 m) ёзиб юборсангиз, дарров ҳисоблаб бераман.';
    default: // uz-latin
      return "Rasmni aniq o'qiy olmadim 🙏 Xonangiz eni va bo'yini (masalan 4×5 m) yozib yuborsangiz, darrov hisoblab beraman.";
  }
}
