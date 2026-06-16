import { parseOrderNumber } from "./order-number";

/** Extract a canonical order number (YYYY-MM-NNNN) from a free-text bot caption.
 *  Accepts the full form OR a short `MM-NNNN`, filling in `currentYear` for the
 *  short form so an operator needn't type the year. Returns the validated
 *  order-number string, or null. `currentYear` is injected (not read from the
 *  clock) so this stays pure/testable. */
export function parseOrderRef(caption: string | null | undefined, currentYear: number): string | null {
  if (!caption) return null;
  // Full YYYY-MM-NNNN wins — try it first so its embedded MM-NNNN isn't re-yeared.
  const full = caption.match(/\d{4}-\d{2}-\d{4}/);
  if (full && parseOrderNumber(full[0])) return full[0];
  // Short MM-NNNN (not part of a longer digit run) → prepend the current year.
  const short = caption.match(/(?<!\d)(\d{2})-(\d{4})(?!\d)/);
  if (short) {
    const candidate = `${String(currentYear).padStart(4, "0")}-${short[1]}-${short[2]}`;
    if (parseOrderNumber(candidate)) return candidate;
  }
  return null;
}
