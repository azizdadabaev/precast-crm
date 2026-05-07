/**
 * Order number scheme: "YYYY-MM-NNNN", monotonic per calendar month.
 *
 * Pure helpers for parsing and constructing the string. Sequence allocation
 * happens at the call site (DB query "max(orderNumber) where year+month")
 * — we don't reach into Prisma from here so this stays unit-testable.
 */

export interface ParsedOrderNumber {
  year: number;
  month: number; // 1-12
  seq: number;
}

const PATTERN = /^(\d{4})-(\d{2})-(\d{4})$/;

export function parseOrderNumber(s: string): ParsedOrderNumber | null {
  const m = PATTERN.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const seq = Number(m[3]);
  if (month < 1 || month > 12) return null;
  return { year, month, seq };
}

export function formatOrderNumber({ year, month, seq }: ParsedOrderNumber): string {
  return (
    String(year).padStart(4, "0") +
    "-" +
    String(month).padStart(2, "0") +
    "-" +
    String(seq).padStart(4, "0")
  );
}

/**
 * Compute the next order number for the given month.
 * Pass the highest existing order number found for that month, or null
 * if none yet, and we'll return seq=1.
 */
export function nextOrderNumber(
  year: number,
  month: number,
  highestThisMonth: string | null,
): string {
  let seq = 1;
  if (highestThisMonth) {
    const parsed = parseOrderNumber(highestThisMonth);
    if (parsed && parsed.year === year && parsed.month === month) {
      seq = parsed.seq + 1;
    }
  }
  return formatOrderNumber({ year, month, seq });
}

/** Inclusive prefix for SQL LIKE / startsWith queries scoping to a month. */
export function orderNumberMonthPrefix(year: number, month: number): string {
  return (
    String(year).padStart(4, "0") + "-" + String(month).padStart(2, "0") + "-"
  );
}
