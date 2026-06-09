// Shared bits for the headless "true 1:1" quote-card render (Plan 09 #5b).
//
// The agent renders the SAME CalculationShareCard the operator's "Send to chat"
// uses, by screenshotting an internal page with a headless browser — so the image
// is pixel-identical and tracks the table designer with zero drift. This module
// holds the page's access token + the ShareData mapper (no puppeteer here, so the
// render page can import it without pulling the browser deps).

import { randomBytes } from 'crypto';
import { formatDraftNumber } from '@/lib/draft-number';
import type { ShareData } from '@/components/share/CalculationShareCard';

// In-process secret gating the internal render page. Puppeteer and the page run
// in the SAME Node process, but Next bundles this module separately per route, so
// a plain module-level const would differ between them. Pinning it on globalThis
// makes it truly process-global (one value shared across every bundle). It rotates
// on each restart; the page 404s without the exact token, so a customer's quote
// card can't be fetched by guessing the project id. No env/config needed.
const tokenHolder = globalThis as typeof globalThis & { __quoteCardToken?: string };
export const QUOTE_CARD_TOKEN: string = (tokenHolder.__quoteCardToken ??= randomBytes(18).toString('hex'));

const num = (v: unknown): number => Number(v);

/** Project shape the render page selects + this mapper consumes. */
export interface CardProject {
  draftNumber: number | null;
  name: string | null;
  tentativeClientName: string | null;
  tentativeClientPhone: string | null;
  tentativeClientAddress: string | null;
  client: { name: string; phone: string; address: string | null } | null;
  calculations: Array<{
    name: string | null;
    innerWidth: unknown;
    innerLength: unknown;
    bearing: unknown;
    pattern: string;
    patternAuto: string | null;
    beamLength: unknown;
    blocksPerRow: number | null;
    blockRows: number;
    totalBlocks: number;
    beamCount: number;
    monolithLength: unknown;
    monolithArea: unknown;
    m2Price: unknown;
    subtotal: unknown;
  }>;
}

/**
 * Mirror of the projects/[id] page's ShareData construction so the agent's card
 * is byte-for-byte the same payload the operator's "Send to chat" feeds. (The
 * card itself is the same component; this just shapes the data identically.)
 */
export function buildShareDataFromProject(p: CardProject): ShareData {
  const draftLabel = p.draftNumber ? formatDraftNumber(p.draftNumber) : '—';
  const displayName = p.name || `Сақланган лойиҳа ${draftLabel}`;
  const clientLabel = p.client?.name ?? p.tentativeClientName ?? '';
  const totals = p.calculations.reduce(
    (a, c) => ({
      blocks: a.blocks + c.totalBlocks,
      beams: a.beams + c.beamCount,
      monolithLength: a.monolithLength + num(c.monolithLength),
      monolithArea: a.monolithArea + num(c.monolithArea),
      sum: a.sum + num(c.subtotal),
    }),
    { blocks: 0, beams: 0, monolithLength: 0, monolithArea: 0, sum: 0 },
  );

  return {
    title: displayName,
    subtitle: 'Лойиҳа',
    clientName: clientLabel || 'Номсиз мижоз',
    clientPhone: p.client?.phone ?? p.tentativeClientPhone ?? null,
    clientAddress: p.client?.address ?? p.tentativeClientAddress ?? null,
    rows: p.calculations.map((c) => ({
      name: c.name ?? '',
      innerWidth: num(c.innerWidth),
      innerLength: num(c.innerLength),
      bearing: num(c.bearing),
      pattern: c.pattern as 'GB' | 'BGB' | 'GBG',
      patternAuto: (c.patternAuto ?? null) as 'GB' | 'BGB' | 'GBG' | null,
      beamLength: num(c.beamLength),
      blocksPerRow: c.blockRows > 0 ? c.blocksPerRow : null,
      totalBlocks: c.totalBlocks,
      beamCount: c.beamCount,
      monolithLength: num(c.monolithLength),
      monolithArea: num(c.monolithArea),
      m2Price: num(c.m2Price),
      subtotal: num(c.subtotal),
    })),
    totals,
  };
}
