import { describe, it, expect } from 'vitest';
import { runGetQuote, getQuoteDefinition } from './get-quote';
import { verifyQuoteToken } from '@/lib/agent/quote-token';
import type { SlabQuotePayload } from '@/lib/agent/slab-quote';
import { calculateSlab, DEFAULT_PRICE_CONFIG } from '@/services/calculation-engine';

const SECRET = 'quote-secret-key';
const NOW = 1_700_000_000_000;

function deps(over: Partial<Parameters<typeof runGetQuote>[1]> = {}) {
  return { pricing: DEFAULT_PRICE_CONFIG, secret: SECRET, now: NOW, ...over };
}

describe('runGetQuote', () => {
  it('prices a room and returns a quote_id that verifies back to the same price', () => {
    const res = runGetQuote({ inner_width: 4, inner_length: 5 }, deps());
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const expected = calculateSlab({ inner_width: 4, inner_length: 5 }, DEFAULT_PRICE_CONFIG);
    expect(res.data.subtotal).toBe(expected.subtotal);
    expect(res.data.m2_price).toBe(expected.m2_price);
    expect(res.data.pattern).toBe(expected.pattern);
    expect(res.data.currency).toBe('UZS');
    expect(res.data.validity_ts).toBe(NOW + 24 * 60 * 60 * 1000);

    const verified = verifyQuoteToken<SlabQuotePayload>(res.data.quote_id, SECRET, { now: NOW });
    expect(verified).not.toBeNull();
    expect(verified!.price).toBe(res.data.subtotal);
    expect(verified!.kind).toBe('slab');
  });

  it('returns a bill of materials straight off the calculator (no invented fields)', () => {
    const res = runGetQuote({ inner_width: 4, inner_length: 5 }, deps());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const e = calculateSlab({ inner_width: 4, inner_length: 5 }, DEFAULT_PRICE_CONFIG);
    expect(res.data.bill_of_materials).toEqual({
      beams: { count: e.beam_count, lengthM: e.beam_length },
      blockRows: e.block_rows,
      totalBlocks: e.total_blocks,
      billedAreaM2: e.billed_area,
    });
  });

  it('escalates (does not crash) when the signing secret is missing', () => {
    const res = runGetQuote({ inner_width: 4, inner_length: 5 }, deps({ secret: '' }));
    expect(res).toEqual({ ok: false, escalate: true, reason: expect.stringContaining('signing') });
  });

  it('escalates on invalid / missing dimensions rather than guessing', () => {
    for (const bad of [
      {},
      { inner_width: 4 },
      { inner_width: 0, inner_length: 5 },
      { inner_width: -1, inner_length: 5 },
      { inner_width: 'wide', inner_length: 5 },
    ]) {
      const res = runGetQuote(bad, deps());
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.escalate).toBe(true);
    }
  });

  it('escalates when the calculator rejects the geometry (CalculationError)', () => {
    // inner_length 0 with no extra beams → engine throws → escalate, never guess.
    const res = runGetQuote({ inner_width: 4, inner_length: 0 }, deps());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.escalate).toBe(true);
  });

  it('uses the injected live pricing (doubling tier prices changes the subtotal)', () => {
    const base = runGetQuote({ inner_width: 4, inner_length: 5 }, deps());
    const bumped = {
      ...DEFAULT_PRICE_CONFIG,
      m2_price_tiers: DEFAULT_PRICE_CONFIG.m2_price_tiers.map((t) => ({ ...t, price: t.price * 2 })),
    };
    const hi = runGetQuote({ inner_width: 4, inner_length: 5 }, deps({ pricing: bumped }));
    expect(base.ok && hi.ok).toBe(true);
    if (base.ok && hi.ok) expect(hi.data.subtotal).not.toBe(base.data.subtotal);
  });

  it('rethrows a non-engine error (e.g. malformed pricing) instead of masking it as a price escalation', () => {
    // A broken PriceConfig is an infra/programming fault, not a customer-input
    // problem — it must surface (throw), never be swallowed into a guessed quote.
    expect(() =>
      runGetQuote({ inner_width: 4, inner_length: 5 }, deps({ pricing: {} as never })),
    ).toThrow();
  });

  it('honours an explicit pattern override', () => {
    const res = runGetQuote({ inner_width: 4, inner_length: 5, pattern: 'GBG' }, deps());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.pattern).toBe('GBG');
  });
});

describe('getQuoteDefinition', () => {
  it('declares strict-friendly schema and bounds its scope in the description', () => {
    expect(getQuoteDefinition.name).toBe('get_quote');
    expect(getQuoteDefinition.inputSchema).toMatchObject({
      type: 'object',
      required: ['inner_width', 'inner_length'],
      additionalProperties: false,
    });
    // The description must steer gazoblok + delivery dates elsewhere / to escalation.
    expect(getQuoteDefinition.description.toLowerCase()).toContain('gazoblok');
    expect(getQuoteDefinition.description.toLowerCase()).toContain('escalate');
  });
});
