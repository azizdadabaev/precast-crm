import { describe, it, expect } from 'vitest';
import {
  buildGazoblokQuote,
  resolveGazoblokProduct,
  type CatalogProduct,
} from './gazoblok-quote';
import { verifyQuoteToken } from './quote-token';
import type { GazoblokQuotePayload } from './gazoblok-quote';
import { estimateWall, lineTotal, GazoblokError } from '@/services/gazoblok-engine';

const SECRET = 'quote-secret-key';
const ISSUED = 1_700_000_000_000;

// 600×300×200 mm and 600×300×300 mm blocks.
const P200: CatalogProduct = { id: 'p200', label: '600×300×200', lengthM: 0.6, heightM: 0.3, thicknessM: 0.2, pricePerBlock: 25_000, active: true };
const P300: CatalogProduct = { id: 'p300', label: '600×300×300', lengthM: 0.6, heightM: 0.3, thicknessM: 0.3, pricePerBlock: 38_000, active: true };
const INACTIVE: CatalogProduct = { id: 'old', label: 'discontinued', lengthM: 0.6, heightM: 0.3, thicknessM: 0.25, pricePerBlock: 1, active: false };
const CATALOG = [P200, P300, INACTIVE];

describe('resolveGazoblokProduct', () => {
  it('resolves by exact productId', () => {
    expect(resolveGazoblokProduct(CATALOG, { productId: 'p300' })).toBe(P300);
  });
  it('resolves by wall thickness in mm among active rows', () => {
    expect(resolveGazoblokProduct(CATALOG, { thicknessMm: 200 })).toBe(P200);
    expect(resolveGazoblokProduct(CATALOG, { thicknessMm: 300 })).toBe(P300);
  });
  it('ignores inactive rows when matching by thickness', () => {
    expect(resolveGazoblokProduct(CATALOG, { thicknessMm: 250 })).toBeNull();
  });
  it('refuses an inactive row even when matched by exact productId', () => {
    expect(resolveGazoblokProduct(CATALOG, { productId: 'old' })).toBeNull();
  });
  it('returns null when nothing matches and when no selector is given', () => {
    expect(resolveGazoblokProduct(CATALOG, { thicknessMm: 999 })).toBeNull();
    expect(resolveGazoblokProduct(CATALOG, { productId: 'nope' })).toBeNull();
    expect(resolveGazoblokProduct(CATALOG, {})).toBeNull();
  });
});

describe('buildGazoblokQuote', () => {
  it('prices a direct quantity and signs a verifiable gazoblok quote_id', () => {
    const q = buildGazoblokQuote(P200, { quantity: 100 }, { secret: SECRET, issuedAt: ISSUED });
    expect(q.price).toBe(lineTotal(P200.pricePerBlock, 100));
    expect(q.quantity).toBe(100);
    expect(q.payload.mode).toBe('quantity');
    expect(q.payload.thicknessMm).toBe(200);

    const v = verifyQuoteToken<GazoblokQuotePayload>(q.quoteId, SECRET, { now: ISSUED });
    expect(v).not.toBeNull();
    expect(v!.kind).toBe('gazoblok');
    expect(v!.price).toBe(q.price);
  });

  it('prices a wall by deriving the block count from estimateWall', () => {
    const wall = { lengthM: 10, heightM: 3, openingsM2: 2 };
    const est = estimateWall(P200, wall);
    const q = buildGazoblokQuote(P200, { wall }, { secret: SECRET, issuedAt: ISSUED });
    expect(q.quantity).toBe(est.blocksNeeded);
    expect(q.price).toBe(lineTotal(P200.pricePerBlock, est.blocksNeeded));
    expect(q.payload.mode).toBe('wall');
    expect(q.payload.wall).toMatchObject({ lengthM: 10, heightM: 3, openingsM2: 2, blocksNeeded: est.blocksNeeded });
  });

  it('stamps a 24h default validity and honours a custom one', () => {
    const q = buildGazoblokQuote(P200, { quantity: 1 }, { secret: SECRET, issuedAt: ISSUED });
    expect(q.payload.expiresAt).toBe(ISSUED + 24 * 60 * 60 * 1000);
    const q2 = buildGazoblokQuote(P200, { quantity: 1 }, { secret: SECRET, issuedAt: ISSUED, validityMs: 60_000 });
    expect(q2.payload.expiresAt).toBe(ISSUED + 60_000);
  });

  it('a token minted under a different secret fails verification', () => {
    const forged = buildGazoblokQuote(P200, { quantity: 5 }, { secret: 'attacker', issuedAt: ISSUED });
    expect(verifyQuoteToken(forged.quoteId, SECRET, { now: ISSUED })).toBeNull();
  });

  it('propagates GazoblokError on invalid quantity (caller escalates)', () => {
    expect(() => buildGazoblokQuote(P200, { quantity: -3 }, { secret: SECRET, issuedAt: ISSUED })).toThrow(GazoblokError);
    expect(() => buildGazoblokQuote(P200, { quantity: 1.5 }, { secret: SECRET, issuedAt: ISSUED })).toThrow(GazoblokError);
  });
});
