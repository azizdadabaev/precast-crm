// Company location (owner request). Customers often ask only for the location —
// to come see the product or load trucks — sometimes with no prior chat at all.
// We detect that intent and reply reliably with the address text + a native map
// pin, even on a first message with no history. The location is owner-provided
// and fixed; edit COMPANY_LOCATION to move it.

import type { ReplyLanguage } from './prompt';

export const COMPANY_LOCATION = {
  lat: 41.18553923427606,
  long: 71.72749098575059,
  mapsUrl: 'https://maps.app.goo.gl/W42Fe7tXRJL6YrxT9',
  addressUzLatin: "Namangan viloyati, Yangiqo'rg'on tumani markazi (eski TRZ)",
  addressUzCyrillic: 'Наманган вилояти, Янгиқўрғон тумани маркази (эски ТРЗ)',
  addressRu: 'Наманганская область, центр Янгикурганского района (старый ТРЗ)',
} as const;

// A request for OUR location. Kept deliberately precise so it does NOT fire when
// a customer is GIVING their own delivery address (bare "manzil" is excluded —
// we require the possessive "manzilingiz" / a map word / an explicit ask).
const LOCATION_INTENT =
  /(lokatsiya|joylashuv|geolokatsiya|manzilingiz|qayerdasiz|qayerda\s+joylash|qayerda\s+turi|xarita|gps|location|your\s+(location|address)|where\s+are\s+you|where\s+.{0,15}located|google\s*maps|локац|ваш\s+адрес|где\s+(вы|наход|распол)|как\s+(доехать|добраться))/iu;

/** True when the message is asking where we are / for our location or map. */
export function detectLocationIntent(text: string): boolean {
  return LOCATION_INTENT.test(text);
}

/** Address line + Maps link in the conversation language. The native map pin is
 *  sent separately by the caller. */
export function locationReplyText(language: ReplyLanguage): string {
  switch (language) {
    case 'ru':
      return `Наш адрес: ${COMPANY_LOCATION.addressRu}.\nЛокация на карте: ${COMPANY_LOCATION.mapsUrl}`;
    case 'uz-cyrillic':
      return `Манзилимиз: ${COMPANY_LOCATION.addressUzCyrillic}.\nХаритада: ${COMPANY_LOCATION.mapsUrl}`;
    default: // uz-latin
      return `Manzilimiz: ${COMPANY_LOCATION.addressUzLatin}.\nXaritada: ${COMPANY_LOCATION.mapsUrl}`;
  }
}
