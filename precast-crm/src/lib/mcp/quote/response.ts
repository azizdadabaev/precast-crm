// The exact JSON the MCP quote tools return — and store as the quote snapshot.
// Pure. One shape for get_quote and get_quote_by_id, so a follow-up question
// ("what was my price again?") always reads back what the customer was told.

import type { SlabQuoteResult } from './slab';
import type { GazoblokQuoteResult } from './gazoblok';
import type { QuoteStatus } from './status';

export interface QuoteMeta {
  quoteId: string | null;
  customerRef: string | null;
  createdAt: Date;
  priceListVersion: string;
  supersedes: string | null;
}

const common = (m: QuoteMeta) => ({
  quote_id: m.quoteId,
  customer_ref: m.customerRef,
  created_at: m.createdAt.toISOString(),
  validity: 'until_withdrawn' as const,
  status: (m.quoteId ? 'active' : 'not_saved') as QuoteStatus | 'not_saved',
  supersedes: m.supersedes,
  price_list_version: m.priceListVersion,
  source: 'claude_mcp' as const,
});

export function slabResponse(r: SlabQuoteResult, m: QuoteMeta & { draftNumber: number | null }) {
  return {
    ...common(m),
    draft_number: m.draftNumber,
    rooms: r.rooms,
    totals: r.totals,
    includes: r.includes,
    excludes: r.excludes,
    warnings: r.warnings,
  };
}

export function gazoblokResponse(r: GazoblokQuoteResult, m: QuoteMeta) {
  const { lang: _lang, ...body } = r;
  return { ...common(m), ...body };
}

/** A saved snapshot as read back later, with its current lifecycle state. */
export function withStatus(snapshot: unknown, status: QuoteStatus, supersededBy: string | null) {
  return { ...(snapshot as Record<string, unknown>), status, superseded_by: supersededBy };
}
