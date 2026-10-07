// Quote identity and lifecycle for MCP quotes (spec 2026-10-07). Pure.
//
// A quote never expires (owner: "valid until I say no"). Staff withdraw a floor
// quote by deleting its AI draft; a newer quote for the same customer_ref
// supersedes the older one; a draft turned into an order reads as ordered.

export type QuoteStatus = 'active' | 'superseded' | 'withdrawn' | 'ordered';

export const formatQuoteId = (n: number) => `Q-${n}`;

/** "Q-12", "Q12", "#12", "12" → 12; anything else → null. */
export function parseQuoteId(raw: string): number | null {
  const m = /^\s*(?:q\s*-?\s*|#)?(\d+)\s*$/i.exec(raw ?? '');
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
