import { parseOrderRef } from "./order-receipt-ref";

/**
 * Extract a gazoblok order number ("B-YYYY-MM-NNNN") from a free-text bot
 * caption/reply. Accepts the full form OR a short "B-MM-NNNN" (the year is
 * autofilled from `currentYear`, exactly like the floor short form). The "B-"
 * prefix is what marks it as gazoblok — Cyrillic "Б" is accepted too and
 * normalized to the stored Latin "B-". Returns the validated gazoblok order
 * number, or null if no gazoblok ref is present.
 *
 * MUST be tried BEFORE parseOrderRef: "B-06-0010" contains "06-0010", which the
 * floor parser would otherwise grab as a floor order.
 */
export function parseGazoblokOrderRef(
  caption: string | null | undefined,
  currentYear: number,
): string | null {
  if (!caption) return null;
  // Latin B/b or Cyrillic Б/б, then the floor-style date-number tail.
  const m = caption.match(/[BbБб]-\s*((?:\d{4}-\d{2}-\d{4})|(?:\d{2}-\d{4}))/);
  if (!m) return null;
  const floor = parseOrderRef(m[1], currentYear); // validates → "YYYY-MM-NNNN"
  return floor ? `B-${floor}` : null;
}
