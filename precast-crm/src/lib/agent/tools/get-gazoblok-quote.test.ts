import { describe, it, expect } from 'vitest';
import { runGetGazoblokQuote, getGazoblokQuoteDefinition } from './get-gazoblok-quote';
import { verifyQuoteToken } from '@/lib/agent/quote-token';
import type { GazoblokQuotePayload, CatalogProduct } from '@/lib/agent/gazoblok-quote';
import { lineTotal } from '@/services/gazoblok-engine';

const SECRET = 'quote-secret-key';
const NOW = 1_700_000_000_000;

const P200: CatalogProduct = { id: 'p200', label: '600×300×200', lengthM: 0.6, heightM: 0.3, thicknessM: 0.2, pricePerBlock: 25_000, active: true };
const P300: CatalogProduct = { id: 'p300', label: '600×300×300', lengthM: 0.6, heightM: 0.3, thicknessM: 0.3, pricePerBlock: 38_000, active: true };
const CATALOG = [P200, P300];

function deps(over: Partial<Parameters<typeof runGetGazoblokQuote>[1]> = {}) {
  return { catalog: CATALOG, secret: SECRET, now: NOW, ...over };
}

describe('runGetGazoblokQuote', () => {
  it('prices a quantity by thickness and returns a verifiable quote_id', () => {
    const res = runGetGazoblokQuote({ thickness_mm: 200, quantity: 50 }, deps());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.price).toBe(lineTotal(25_000, 50));
    expect(res.data.thickness_mm).toBe(200);
    expect(res.data.mode).toBe('quantity');
    expect(res.data.validity_ts).toBe(NOW + 24 * 60 * 60 * 1000);

    const v = verifyQuoteToken<GazoblokQuotePayload>(res.data.quote_id, SECRET, { now: NOW });
    expect(v!.kind).toBe('gazoblok');
    expect(v!.price).toBe(res.data.price);
  });

  it('computes delivered weight from block volume × D600 density (≈22 kg for a 200mm block)', () => {
    const res = runGetGazoblokQuote({ thickness_mm: 200, quantity: 50 }, deps());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // 0.6 × 0.3 × 0.2 m³ × 600 kg/m³ = 21.6 kg/block → 50 × 21.6 = 1080 kg.
    expect(res.data.weight_kg).toBe(1080);
    expect(Math.round(res.data.weight_kg / 50)).toBe(22); // matches owner's "D600 = 22kg"
  });

  it('prices a wall request', () => {
    const res = runGetGazoblokQuote({ product_id: 'p300', wall: { length_m: 8, height_m: 3 } }, deps());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.mode).toBe('wall');
  });

  it('escalates on an empty catalog (never invents a price)', () => {
    const res = runGetGazoblokQuote({ thickness_mm: 200, quantity: 10 }, deps({ catalog: [] }));
    expect(res).toMatchObject({ ok: false, escalate: true });
  });

  it('escalates when no size matches the requested thickness', () => {
    const res = runGetGazoblokQuote({ thickness_mm: 999, quantity: 10 }, deps());
    expect(res).toMatchObject({ ok: false, escalate: true });
  });

  it('escalates when the signing secret is missing', () => {
    const res = runGetGazoblokQuote({ thickness_mm: 200, quantity: 10 }, deps({ secret: '' }));
    expect(res).toMatchObject({ ok: false, escalate: true });
  });

  it('escalates on a request missing both a size and a quantity/wall', () => {
    expect(runGetGazoblokQuote({ quantity: 10 }, deps())).toMatchObject({ ok: false, escalate: true });
    expect(runGetGazoblokQuote({ thickness_mm: 200 }, deps())).toMatchObject({ ok: false, escalate: true });
  });

  it('escalates on an ambiguous request specifying BOTH quantity and wall', () => {
    const res = runGetGazoblokQuote(
      { thickness_mm: 200, quantity: 10, wall: { length_m: 8, height_m: 3 } },
      deps(),
    );
    expect(res).toMatchObject({ ok: false, escalate: true });
  });

  it('escalates on a non-positive / non-integer quantity', () => {
    expect(runGetGazoblokQuote({ thickness_mm: 200, quantity: 0 }, deps())).toMatchObject({ ok: false, escalate: true });
    expect(runGetGazoblokQuote({ thickness_mm: 200, quantity: 2.5 }, deps())).toMatchObject({ ok: false, escalate: true });
  });
});

describe('getGazoblokQuoteDefinition', () => {
  it('names itself and steers flooring + delivery-dates to escalation', () => {
    expect(getGazoblokQuoteDefinition.name).toBe('get_gazoblok_quote');
    const d = getGazoblokQuoteDefinition.description.toLowerCase();
    expect(d).toContain('flooring');
    expect(d).toContain('escalate');
  });
});
