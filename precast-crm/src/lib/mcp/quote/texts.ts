// Customer-facing labels the MCP quote tools return, in the customer's language.
// Uzbek is Latin script here: these texts go into Instagram replies, where
// customers write Latin Uzbek (the CRM's own UI stays Cyrillic).

export type Lang = 'uz' | 'ru' | 'en';

interface QuoteTexts {
  roomName: (n: number) => string;
  slabIncludes: string;
  slabExcludes: string[];
  spanOver630: (name: string, beam: number) => string;
  longSide: (name: string) => string;
  nothingPriced: string;
  gazIncludes: string;
  deliveryIncluded: string;
  deliveryNotIncluded: string;
  deliveryUnknown: string;
}

const fmt = (n: number) => n.toFixed(2).replace('.', ',');

export const TEXTS: Record<Lang, QuoteTexts> = {
  uz: {
    roomName: (n) => `Xona ${n}`,
    slabIncludes: "faqat materiallar (balkalar + bloklar), zavoddan olib ketiladi",
    slabExcludes: [
      'yetkazib berish',
      "o'rnatish",
      'beton qoplama',
      "armatura to'r",
      "oraliq tirgak (5,30 m dan uzun balkalar)",
    ],
    spanOver630: (name, beam) =>
      `${name}: balka ${fmt(beam)} m — 6,30 m dan uzun, narx berilmadi, alohida ko'rib chiqiladi`,
    longSide: (name) =>
      `${name}: balkalar uzun devorga qo'yildi (so'ralganidek); qisqa devorga qo'yilsa arzonroq bo'ladi`,
    nothingPriced: "Hech bir xonaga narx berilmadi — o'lchamlar alohida ko'rib chiqiladi",
    gazIncludes: 'faqat gazoblok',
    deliveryIncluded: "Yangiqo'rg'on tumani ichida yetkazib berish narxga kiradi",
    deliveryNotIncluded: 'Yetkazib berish narxga kirmaydi, transport alohida kelishiladi',
    deliveryUnknown: "Yetkazib berish: Yangiqo'rg'on tumani ichida bepul, boshqa joylarga alohida kelishiladi",
  },
  ru: {
    roomName: (n) => `Комната ${n}`,
    slabIncludes: 'только материалы (балки + блоки), самовывоз с завода',
    slabExcludes: [
      'доставка',
      'монтаж',
      'бетонная стяжка',
      'арматурная сетка',
      'промежуточная опора (балки длиннее 5,30 м)',
    ],
    spanOver630: (name, beam) =>
      `${name}: балка ${fmt(beam)} м — длиннее 6,30 м, цена не рассчитана, нужна отдельная проверка`,
    longSide: (name) =>
      `${name}: балки уложены по длинной стороне (как указано); по короткой стороне было бы дешевле`,
    nothingPriced: 'Ни одна комната не рассчитана — размеры нужно проверить отдельно',
    gazIncludes: 'только газоблок',
    deliveryIncluded: 'Доставка по Янгикурганскому району включена в цену',
    deliveryNotIncluded: 'Доставка не включена, транспорт оговаривается отдельно',
    deliveryUnknown: 'Доставка: по Янгикурганскому району бесплатно, в другие места оговаривается отдельно',
  },
  en: {
    roomName: (n) => `Room ${n}`,
    slabIncludes: 'materials only (beams + blocks), pickup at the yard',
    slabExcludes: [
      'delivery',
      'installation',
      'concrete topping',
      'steel mesh',
      'mid-span prop (beams over 5.30 m)',
    ],
    spanOver630: (name, beam) =>
      `${name}: beam ${beam.toFixed(2)} m is longer than 6.30 m — not priced, needs manual review`,
    longSide: (name) =>
      `${name}: beams rest on the long side (as given); spanning the short side would be cheaper`,
    nothingPriced: 'No room could be priced — the sizes need manual review',
    gazIncludes: 'gazoblok only',
    deliveryIncluded: "Delivery within Yangiqo'rg'on district is included",
    deliveryNotIncluded: 'Delivery is not included; transport is agreed separately',
    deliveryUnknown: "Delivery: free within Yangiqo'rg'on district, elsewhere agreed separately",
  },
};

export function textsFor(lang: unknown): { lang: Lang; t: QuoteTexts } {
  const l: Lang = lang === 'ru' || lang === 'en' ? lang : 'uz';
  return { lang: l, t: TEXTS[l] };
}
