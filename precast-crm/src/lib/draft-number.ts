/**
 * Draft number scheme: "NNNND" — four zero-padded digits followed by
 * a literal "D" suffix that brands the row as a saved draft.
 *
 * Unlike Order.orderNumber (which is monotonic per calendar month),
 * draft numbers are a SINGLE global counter. They're assigned to
 * Project rows at create time when no operator-typed name was
 * supplied; the suffix means an operator skimming a downloads folder
 * or chat history can tell a draft apart from a real order at a
 * glance.
 *
 * Allocation lives at the call site (POST /api/projects) so this
 * stays a pure helper and unit-testable.
 */

const PATTERN = /^(\d{4,})D$/;

export interface ParsedDraftNumber {
  seq: number;
}

export function parseDraftNumber(s: string): ParsedDraftNumber | null {
  const m = PATTERN.exec(s);
  if (!m) return null;
  return { seq: Number(m[1]) };
}

/**
 * Render a numeric sequence as the canonical display string,
 * left-padded to four digits with a trailing "D".
 *
 *   formatDraftNumber(1)    → "0001D"
 *   formatDraftNumber(42)   → "0042D"
 *   formatDraftNumber(9999) → "9999D"
 *   formatDraftNumber(10000) → "10000D"   // padding doesn't truncate
 */
export function formatDraftNumber(seq: number): string {
  if (!Number.isInteger(seq) || seq < 1) {
    throw new RangeError(`draft sequence must be a positive integer (got ${seq})`);
  }
  return String(seq).padStart(4, "0") + "D";
}

/**
 * Given the current maximum draftNumber in the DB (or null when no
 * drafts exist yet), return the next sequence integer to assign.
 * Use this inside a transaction; the @unique constraint on the
 * column catches the rare race.
 */
export function nextDraftNumber(currentMax: number | null): number {
  return (currentMax ?? 0) + 1;
}
