import { describe, it, expect } from 'vitest';
import { buildSlabQuote } from './slab-quote';
import { verifyQuoteToken } from './quote-token';
import { calculateSlab, DEFAULT_PRICE_CONFIG, CalculationError } from '@/services/calculation-engine';

const SECRET = 'quote-secret-key';
const ISSUED = 1_700_000_000_000;

describe('buildSlabQuote', () => {
  it('prices a room exactly as the calculator does, and stamps currency + validity', () => {
    const input = { inner_width: 4, inner_length: 5 };
    const expected = calculateSlab(input, DEFAULT_PRICE_CONFIG);

    const quote = buildSlabQuote(input, { secret: SECRET, issuedAt: ISSUED });

    expect(quote.price).toBe(expected.subtotal);
    expect(quote.currency).toBe('UZS');
    expect(quote.pattern).toBe(expected.pattern);
    expect(quote.payload.expiresAt).toBe(ISSUED + 24 * 60 * 60 * 1000); // default 24h
    expect(quote.payload.kind).toBe('slab');
    expect(typeof quote.quoteId).toBe('string');
  });

  it('produces a quoteId the order tool can verify back to the same trusted price', () => {
    const input = { inner_width: 3.5, inner_length: 6 };
    const quote = buildSlabQuote(input, { secret: SECRET, issuedAt: ISSUED });

    const verified = verifyQuoteToken<{ price: number; kind: string }>(quote.quoteId, SECRET, { now: ISSUED });
    expect(verified).not.toBeNull();
    expect(verified!.price).toBe(quote.price);
    expect(verified!.kind).toBe('slab');
  });

  it('a quoteId minted under a different secret is rejected by the trusted secret', () => {
    const input = { inner_width: 3.5, inner_length: 6 };
    const forged = buildSlabQuote(input, { secret: 'attacker-secret', issuedAt: ISSUED });
    expect(verifyQuoteToken(forged.quoteId, SECRET, { now: ISSUED })).toBeNull();
  });

  it('honours a custom validityMs', () => {
    const quote = buildSlabQuote(
      { inner_width: 4, inner_length: 5 },
      { secret: SECRET, issuedAt: ISSUED, validityMs: 60_000 },
    );
    expect(quote.payload.expiresAt).toBe(ISSUED + 60_000);
  });

  it('propagates calculator validation errors (so the agent escalates rather than guessing)', () => {
    expect(() => buildSlabQuote({ inner_width: 0, inner_length: 5 }, { secret: SECRET, issuedAt: ISSUED }))
      .toThrow(CalculationError);
  });
});
