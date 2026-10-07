import { describe, it, expect } from 'vitest';
import { DEFAULT_PRICE_CONFIG } from '@/services/calculation-engine';
import { buildSlabQuote, QuoteInputError, strandsPerBeam, needsProp } from './slab';

const P = DEFAULT_PRICE_CONFIG;
const q = (rooms: Array<{ name?: string; width_m: number; length_m: number }>, extra: Record<string, unknown> = {}) =>
  buildSlabQuote({ rooms, ...extra }, P);

describe('buildSlabQuote — 4.0 × 6.0 m golden (the example sent to the owner)', () => {
  const r = q([{ width_m: 4, length_m: 6 }]);
  const room = r.rooms[0];
  it('prices exactly like the CRM engine: 11 beams, 200 blocks, 3 749 600 UZS', () => {
    expect(room.status).toBe('priced');
    expect(room).toMatchObject({
      beam_length_m: 4.3, beam_count: 11, block_rows: 10, block_count: 200,
      area_m2: 25.46, billed_area_m2: 24.94, closing_piece: 'beam', closing_piece_price: 258000,
      strands_per_beam: 4, needs_prop: false, price_per_m2: 140000, subtotal: 3749600,
      beams_span: 'short_side', span_m: 4, orientation: 'auto', width_m: 4, length_m: 6,
    });
    expect(r.totals).toEqual({ area_m2: 25.46, beam_count: 11, block_count: 200, total_weight_kg: 4582, total_price: 3749600, currency: 'UZS' });
  });
  it('produces one draft row for the priced room', () => {
    expect(r.calcs).toHaveLength(1);
    expect(Number(r.calcs[0].subtotal)).toBe(3749600);
    expect(r.calcs[0].name).toBe('Xona 1');
  });
});

describe('orientation', () => {
  it('auto turns 6 × 4 so the beams span the shorter wall — same price as 4 × 6', () => {
    const room = q([{ width_m: 6, length_m: 4 }]).rooms[0];
    expect(room).toMatchObject({ subtotal: 3749600, span_m: 4, beams_span: 'short_side', width_m: 6, length_m: 4 });
  });
  it('as_given 6 × 4 uses the 6 m span: 6.30 beam, 180 000/m², 6 strands, needs a prop', () => {
    const r = q([{ width_m: 6, length_m: 4 }], { orientation: 'as_given', lang: 'en' });
    expect(r.rooms[0]).toMatchObject({
      beam_length_m: 6.3, price_per_m2: 180000, subtotal: 4604040, strands_per_beam: 6,
      needs_prop: true, beams_span: 'long_side', span_m: 6,
    });
    expect(r.warnings.join(' ')).toMatch(/long/i);
  });
});

describe('beams over 6.30 m', () => {
  it('7 × 8 (7.30 beam even on the short side) is not priced and not saved', () => {
    const r = q([{ name: 'Zal', width_m: 7, length_m: 8 }], { lang: 'en' });
    expect(r.rooms[0]).toMatchObject({ name: 'Zal', status: 'needs_manual_review', reason: 'span_over_6_30', beam_length_m: 7.3 });
    expect(r.rooms[0].subtotal).toBeUndefined();
    expect(r.calcs).toHaveLength(0);
    expect(r.totals.total_price).toBe(0);
    expect(r.warnings.join(' ')).toMatch(/6\.30/);
  });
  it('a mixed quote totals only the priced rooms', () => {
    const r = q([{ width_m: 4, length_m: 6 }, { width_m: 7, length_m: 8 }]);
    expect(r.totals.total_price).toBe(3749600);
    expect(r.calcs).toHaveLength(1);
  });
});

describe('agent layout rule', () => {
  it('never Г-Б-Г: 4 × 6.1 is rounded up to Г-Б (no closing piece)', () => {
    const room = q([{ width_m: 4, length_m: 6.1 }]).rooms[0];
    expect(room).toMatchObject({ closing_piece: 'none', closing_piece_price: 0, beam_count: 11, block_rows: 11, subtotal: 3840760 });
  });
});

describe('validation', () => {
  const code = (fn: () => unknown) => {
    try { fn(); } catch (e) { return e instanceof QuoteInputError ? e.code : 'OTHER'; }
    return 'NONE';
  };
  it('refuses impossible sizes with clear codes', () => {
    expect(code(() => q([{ width_m: 0, length_m: 5 }]))).toBe('INVALID_INPUT');
    expect(code(() => q([{ width_m: 13, length_m: 5 }]))).toBe('WIDTH_OUT_OF_RANGE');
    expect(code(() => q([{ width_m: 4, length_m: 51 }]))).toBe('LENGTH_OUT_OF_RANGE');
    expect(code(() => q(Array.from({ length: 21 }, () => ({ width_m: 4, length_m: 5 }))))).toBe('TOO_MANY_ROOMS');
    expect(code(() => q([]))).toBe('INVALID_INPUT');
    expect(code(() => q([{ width_m: 4, length_m: 5 }], { bearing_cm: 40 }))).toBe('INVALID_INPUT');
  });
});

describe('product facts', () => {
  it('strands per beam: 4 up to 4.30, 5 up to 5.30, 6 up to 6.30', () => {
    expect([4.3, 4.31, 5.3, 5.31, 6.3].map(strandsPerBeam)).toEqual([4, 5, 5, 6, 6]);
  });
  it('a prop only above 5.30 m', () => {
    expect(needsProp(5.3)).toBe(false);
    expect(needsProp(5.31)).toBe(true);
  });
});

describe('language', () => {
  it('texts follow lang (Latin Uzbek by default)', () => {
    expect(q([{ width_m: 4, length_m: 6 }]).includes).toMatch(/material/i);
    expect(q([{ width_m: 4, length_m: 6 }], { lang: 'ru' }).includes).toMatch(/материал/i);
    expect(q([{ width_m: 4, length_m: 6 }], { lang: 'en' }).excludes).toContain('mid-span prop (beams over 5.30 m)');
  });
});
