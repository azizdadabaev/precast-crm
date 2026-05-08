/**
 * Phone normalization for the Uzbekistan market.
 *
 * Storage format:  digits only, with leading "998" if it can be inferred.
 *                  e.g. "998901112233"
 * Display format:  "+998 90 111 22 33"
 *
 * Why digits-only for storage: an operator might type "+998 90 111 22 33"
 * on one call and "998901112233" or "8 (90) 111-22-33" on the next.
 * Stripping non-digits gives one canonical form so the unique-by-phone
 * lookup never produces duplicates.
 */

/** Returns digits only. Empty string if input is null/undefined. */
export function digitsOnly(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/\D+/g, "");
}

/**
 * Normalize a phone for storage and dedup.
 *
 * Heuristics for Uzbekistan numbers:
 *   - if 12 digits starting with 998 → keep as-is
 *   - if 9 digits (operator code + subscriber, e.g. 901112233) → prefix 998
 *   - if 10 digits starting with 8 (Soviet trunk prefix) → swap to 998
 *   - otherwise return whatever digits we have (best-effort)
 */
export function normalizePhone(input: string | null | undefined): string {
  const d = digitsOnly(input);
  if (!d) return "";
  if (d.length === 12 && d.startsWith("998")) return d;
  if (d.length === 9) return "998" + d;
  if (d.length === 10 && d.startsWith("8")) return "998" + d.slice(1);
  if (d.length === 11 && d.startsWith("8")) return "998" + d.slice(1);
  return d;
}

/**
 * Format a stored (digits-only) phone for display.
 * "998901112233" → "+998 90 111 22 33"
 *
 * If the input doesn't look like a UZ number, falls back to inserting
 * spaces every 3 digits from the right.
 */
export function formatPhone(stored: string | null | undefined): string {
  const d = digitsOnly(stored);
  if (!d) return "";
  if (d.length === 12 && d.startsWith("998")) {
    // +998 NN NNN NN NN
    return `+998 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10, 12)}`;
  }
  return d;
}

/**
 * Compact format — the same number with no spaces, just the leading "+":
 * "998901112233" → "+998901112233"
 *
 * Use this where the number will be pasted into a messenger that
 * auto-detects clickable phone links (WhatsApp, Telegram). The
 * unspaced form is the most reliable trigger for those detectors.
 */
export function formatPhoneCompact(stored: string | null | undefined): string {
  const d = digitsOnly(stored);
  if (!d) return "";
  if (d.length === 12 && d.startsWith("998")) return `+${d}`;
  return d;
}

/**
 * Match-friendly forms of a phone for searching by partial digits.
 * Returns an array of canonicalised digit strings to substring-match against.
 *
 * For "998901112233" the matchable forms include:
 *   "998901112233"  (full canonical)
 *   "901112233"     (without country code)
 *   "1112233"       (last 7)
 *   "2233"          (last 4)
 */
export function phoneMatchForms(stored: string): string[] {
  const d = digitsOnly(stored);
  if (!d) return [];
  const forms: Set<string> = new Set();
  forms.add(d);
  if (d.length >= 9) forms.add(d.slice(-9));
  if (d.length >= 7) forms.add(d.slice(-7));
  if (d.length >= 4) forms.add(d.slice(-4));
  return Array.from(forms);
}

/** Returns true if `query` (any non-digit input) matches the trailing digits of `stored`. */
export function phoneMatches(stored: string, query: string): boolean {
  const q = digitsOnly(query);
  if (!q) return false;
  return digitsOnly(stored).endsWith(q);
}
