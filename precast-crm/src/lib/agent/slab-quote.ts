// buildSlabQuote — composes the pure slab calculator with a signed quote token
// (spec §4.2). The agent's get_quote tool (a later plan) calls this with the
// LIVE PriceConfig and process.env.QUOTE_SIGNING_SECRET; here PriceConfig is
// injected (defaults to the engine's DEFAULT_PRICE_CONFIG) so this stays pure.

import {
  calculateSlab,
  DEFAULT_PRICE_CONFIG,
  type SlabInput,
  type PriceConfig,
} from '@/services/calculation-engine';
import { mintQuoteToken } from './quote-token';

const DEFAULT_VALIDITY_MS = 24 * 60 * 60 * 1000; // 24h

export interface SlabQuotePayload {
  kind: 'slab';
  currency: 'UZS';
  price: number; // = SlabResult.subtotal — the only number the order tool trusts
  pattern: string;
  beamLength: number;
  beamCount: number;
  blockRows: number;
  totalBlocks: number;
  billedArea: number;
  m2Price: number;
  input: SlabInput; // snapshot of the dimensions that produced this price
  issuedAt: number;
  expiresAt: number;
}

export interface SlabQuote {
  quoteId: string; // the signed token — this is the quote_id
  price: number;
  currency: 'UZS';
  pattern: string;
  payload: SlabQuotePayload;
}

export interface BuildSlabQuoteOptions {
  secret: string;
  issuedAt: number;
  validityMs?: number;
  priceConfig?: PriceConfig;
}

/**
 * Calculate a slab price and return it as a signed quote. Throws
 * CalculationError on invalid input (the caller escalates instead of guessing).
 */
export function buildSlabQuote(input: SlabInput, opts: BuildSlabQuoteOptions): SlabQuote {
  const r = calculateSlab(input, opts.priceConfig ?? DEFAULT_PRICE_CONFIG);
  const issuedAt = opts.issuedAt;
  const expiresAt = issuedAt + (opts.validityMs ?? DEFAULT_VALIDITY_MS);

  const payload: SlabQuotePayload = {
    kind: 'slab',
    currency: 'UZS',
    price: r.subtotal,
    pattern: r.pattern,
    beamLength: r.beam_length,
    beamCount: r.beam_count,
    blockRows: r.block_rows,
    totalBlocks: r.total_blocks,
    billedArea: r.billed_area,
    m2Price: r.m2_price,
    input,
    issuedAt,
    expiresAt,
  };

  return {
    quoteId: mintQuoteToken(payload, opts.secret),
    price: r.subtotal,
    currency: 'UZS',
    pattern: r.pattern,
    payload,
  };
}
