/**
 * Map a free-text Client.address (Cyrillic / Latin / mixed transliteration)
 * to a canonical Uzbek city name. Used by the dashboard's "Customers by
 * city" aggregation so addresses like "г. Ташкент, Юнусабад 12-7" and
 * "Tashkent center" both land in the same bucket.
 *
 * The returned set is intentionally limited to the 13 largest Uzbek
 * cities + a catch-all "Other" bucket. If a future address doesn't
 * match any pattern, it ends up in "Other" — operators can add new
 * patterns here when a region grows enough to warrant its own row.
 */
const CITY_PATTERNS: Array<{ canonical: string; patterns: RegExp[] }> = [
  { canonical: "Toshkent",  patterns: [/toshkent/i, /tashkent/i, /ташкент/i, /тошкент/i] },
  { canonical: "Samarqand", patterns: [/samarqand/i, /самарканд/i, /самарқанд/i] },
  { canonical: "Buxoro",    patterns: [/buxoro/i, /bukhara/i, /бухара/i] },
  { canonical: "Andijon",   patterns: [/andijon/i, /андижан/i, /андижон/i] },
  { canonical: "Namangan",  patterns: [/namangan/i, /наманган/i] },
  { canonical: "Farg'ona",  patterns: [/farg/i, /fergana/i, /фергана/i, /фарғона/i] },
  { canonical: "Qarshi",    patterns: [/qarshi/i, /карши/i, /қарши/i] },
  { canonical: "Nukus",     patterns: [/nukus/i, /нукус/i] },
  { canonical: "Navoi",     patterns: [/navoi/i, /навои/i, /навоий/i] },
  { canonical: "Termez",    patterns: [/termez/i, /термез/i] },
  { canonical: "Jizzax",    patterns: [/jizzax/i, /джизак/i, /жиззах/i] },
  { canonical: "Guliston",  patterns: [/guliston/i, /гулистан/i] },
  { canonical: "Urganch",   patterns: [/urganch/i, /ургенч/i] },
];

export const CANONICAL_CITIES = CITY_PATTERNS.map((c) => c.canonical);

export function normalizeCity(address: string | null | undefined): string {
  if (!address) return "Other";
  for (const { canonical, patterns } of CITY_PATTERNS) {
    if (patterns.some((p) => p.test(address))) return canonical;
  }
  return "Other";
}
