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
