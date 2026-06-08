// Lint an owner's knowledge-base edit for UZS-price-shaped text (spec §9 — the KB
// must contain NO prices; every price comes from a tool). Conservative on
// purpose: it must NOT flag the KB's legitimate spec/dimension numbers
// (0.58 m, 600-1000 kg/m², ГОСТ 7348-81, 5mm, 1670 MPa, 4-5 tonna). It flags only:
//   (a) a number adjacent to a currency word (so'm / сум / сўм / сом / UZS), or
//   (b) a thousands-grouped amount (1 000 000 / 1.000.000 / 500,000).
// All chars below are visible (no zero-width); the apostrophe class covers the
// straight ', curly ’ and ʻ forms of "so'm".

const CURRENCY = /\d[\d\s.,]*\s*(?:so['’ʻ]?m|сум|сўм|сом|uzs)/gi;
const GROUPED = /\b\d{1,3}(?:[ .,]\d{3})+\b/g;

/** Price-shaped snippets found in the KB text (deduped, capped). Empty = clean. */
export function findKbPrices(content: string): string[] {
  const hits = new Set<string>();
  for (const re of [CURRENCY, GROUPED]) {
    for (const m of content.matchAll(re)) hits.add(m[0].trim());
  }
  return [...hits].slice(0, 20);
}
