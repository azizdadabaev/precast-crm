// Script-insensitive search folding for the bilingual (Uzbek Latin / Uzbek &
// Russian Cyrillic) UI. Folds any name/text to a canonical lowercase,
// alphanumeric-only form so an operator finds a chat whichever alphabet they
// type vs. however the name is stored — "Алишер" matches "Alisher", "Тошкент"
// matches "Toshkent". This is the same cross-alphabet idea the address search
// uses (addressSearchForms), generalized to free-form text via a letter map.

// Lowercase Cyrillic → Latin. Covers the Uzbek Cyrillic alphabet (ў ғ қ ҳ) and
// the Russian letters customers also use. Digraphs (ш→sh, ч→ch …) are mapped
// BEFORE the alphanumeric strip so they survive. Latin letters/digits pass
// through unchanged, so a Latin name folds to itself.
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", ғ: "g", д: "d", е: "e", ё: "yo",
  ж: "j", з: "z", и: "i", й: "y", к: "k", қ: "q", л: "l", м: "m",
  н: "n", о: "o", ў: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "x", ҳ: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sh",
  ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
};

/**
 * Fold a string to a canonical form for script-insensitive substring search.
 * Lowercases, transliterates Cyrillic → Latin, then keeps only [a-z0-9]
 * (dropping spaces, apostrophes — the Uzbek Latin ʻ / ' — and punctuation, and
 * stripping diacritics via NFD). Pure.
 */
export function foldForSearch(input: string | null | undefined): string {
  if (!input) return "";
  let out = "";
  for (const ch of input.toLowerCase()) {
    out += CYRILLIC_TO_LATIN[ch] ?? ch;
  }
  return out.normalize("NFD").replace(/[^a-z0-9]/g, "");
}

/**
 * True when `query` matches `haystack` under script-insensitive folding. An
 * empty/whitespace query matches everything (so an empty search box shows all).
 * Pass several fields joined with a space as the haystack to search across them.
 */
export function matchesSearch(haystack: string, query: string): boolean {
  const q = foldForSearch(query);
  if (!q) return true;
  return foldForSearch(haystack).includes(q);
}
