// Quote identity and lifecycle for MCP quotes (spec 2026-10-07). Pure.
//
// A quote never expires (owner: "valid until I say no"). Staff withdraw a floor
// quote by deleting its AI draft; a newer quote for the same customer_ref
// supersedes the older one; a draft turned into an order reads as ordered.

export type QuoteStatus = 'active' | 'superseded' | 'withdrawn' | 'ordered';

export const formatQuoteId = (n: number) => `Q-${n}`;

/** "Q-12" / "Q12" → 12. A bare number or "#12" is refused: it looks like a CRM
 *  draft number (0575D) and would silently open a different quote. */
export function parseQuoteId(raw: string): number | null {
  const m = /^\s*q\s*-?\s*(\d+)\s*$/i.exec(raw ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Precedence: withdrawn > superseded > ordered > active. */
export function quoteStatus(q: {
  kind: string;
  projectId: string | null;
  supersededById: string | null;
  projectStatus: string | null;
}): QuoteStatus {
  if (q.kind === 'slab' && q.projectId === null) return 'withdrawn';
  if (q.supersededById) return 'superseded';
  if (q.projectStatus === 'ORDERED') return 'ordered';
  return 'active';
}

/** Instagram handles are case-insensitive and often sent with a leading "@". */
export function normalizeCustomerRef(ref: string | null | undefined): string | null {
  const v = (ref ?? '').trim().replace(/^@+/, '').toLowerCase();
  return v ? v.slice(0, 80) : null;
}

/** A quote saved for a customer is visible only with that customer's ref, so a
 *  stranger cannot read another customer's quote by guessing Q-numbers. */
export function refAllows(quoteRef: string | null, givenRef: string | null): boolean {
  return !quoteRef || quoteRef === givenRef;
}

/** True while the draft still holds exactly what was quoted: same priced rooms,
 *  same total, no discount added. False once staff changed it. */
export function draftMatchesSnapshot(
  draft: { subtotals: number[]; discountPercent: number; discountAmount: number },
  snapshot: unknown,
): boolean {
  const s = snapshot as { rooms?: Array<{ status?: string }>; totals?: { total_price?: number } };
  const priced = (s.rooms ?? []).filter((r) => r.status === 'priced').length;
  const total = Math.round(draft.subtotals.reduce((a, b) => a + b, 0));
  return (
    priced === draft.subtotals.length &&
    total === s.totals?.total_price &&
    draft.discountPercent === 0 &&
    draft.discountAmount === 0
  );
}
