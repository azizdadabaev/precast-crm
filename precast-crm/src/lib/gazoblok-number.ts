/**
 * Газоблок order number: "B-YYYY-MM-NNNN", monotonic per calendar month.
 *
 * The "B-" prefix (Б for Газоблок) keeps these numbers from ever colliding
 * with floor order numbers ("YYYY-MM-NNNN") even though they live in a
 * separate table. Pure helpers — sequence allocation happens at the call
 * site (DB "max(orderNumber) where startsWith prefix"), like order-number.ts.
 */

const PREFIX = "B-";
const PATTERN = /^B-(\d{4})-(\d{2})-(\d{4})$/;

/** Inclusive prefix for startsWith queries scoping to one month. */
export function gazoblokMonthPrefix(year: number, month: number): string {
  return (
    PREFIX + String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-"
  );
}

/**
 * Next order number for the given month. Pass the highest existing number
 * found for that month, or null if none yet (→ seq 1).
 */
export function nextGazoblokOrderNumber(
  year: number,
  month: number,
  highestThisMonth: string | null,
): string {
  let seq = 1;
  if (highestThisMonth) {
    const m = PATTERN.exec(highestThisMonth);
    if (m && Number(m[1]) === year && Number(m[2]) === month) {
      seq = Number(m[3]) + 1;
    }
  }
  return gazoblokMonthPrefix(year, month) + String(seq).padStart(4, "0");
}

const SHORT_PATTERN = /^[GgГг](\d)(\d{0,2})(\d*)$/;

/**
 * The number as people see it: «B-2026-11-0004» → «G61104» — "G", the last
 * digit of the year, the month, then the sequence (two digits, growing past 99
 * orders in a month). Display only: the stored number never changes, so
 * receipts and share cards issued with the long form still find their order.
 */
export function shortGazoblokNumber(stored: string): string {
  const m = PATTERN.exec(stored);
  if (!m) return stored;
  return "G" + m[1].slice(-1) + m[2] + String(Number(m[3])).padStart(2, "0");
}

/** The latest year up to `currentYear` that ends in `digit`. */
function yearForDigit(digit: number, currentYear: number): number {
  return currentYear - ((((currentYear - digit) % 10) + 10) % 10);
}

function splitShort(text: string, currentYear: number) {
  const m = SHORT_PATTERN.exec(text.trim());
  if (!m) return null;
  const month = Number(m[2]);
  const monthOk = m[2].length === 2 && month >= 1 && month <= 12;
  return { year: yearForDigit(Number(m[1]), currentYear), month, monthOk, monthDigits: m[2], seq: m[3] };
}

/** Stored number for a complete typed short form («G61104», «г61104»), or null. */
export function expandShortGazoblokNumber(short: string, currentYear: number): string | null {
  const s = splitShort(short, currentYear);
  if (!s || !s.monthOk || s.seq.length < 2 || s.seq.length > 4) return null;
  return gazoblokMonthPrefix(s.year, s.month) + s.seq.padStart(4, "0");
}

/**
 * What a typed short number must match with startsWith on the stored number:
 * the exact number once complete, the month or the year while it is still
 * being typed. Null when the text is not a short number.
 */
export function shortGazoblokSearchPrefix(text: string, currentYear: number): string | null {
  const s = splitShort(text, currentYear);
  if (!s) return null;
  const yearPrefix = PREFIX + String(s.year).padStart(4, "0") + "-";
  if (s.monthDigits.length < 2) return yearPrefix;
  if (!s.monthOk) return null;
  return expandShortGazoblokNumber(text.trim(), currentYear) ?? gazoblokMonthPrefix(s.year, s.month);
}
