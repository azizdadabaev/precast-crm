import { describe, it, expect } from 'vitest';
import { estimateWall } from '@/services/gazoblok-engine';
import { buildGazoblokQuote, type GazoblokCatalogRow } from './gazoblok';
import { QuoteInputError } from './slab';

const CATALOG: GazoblokCatalogRow[] = [
  { id: 'p1', label: '600×300×200', lengthM: 0.6, heightM: 0.3, thicknessM: 0.2, pricePerBlock: 9500, active: true, stockQuantity: 500 },
  { id: 'p2', label: '600×300×300', lengthM: 0.6, heightM: 0.3, thicknessM: 0.3, pricePerBlock: 14000, active: true, stockQuantity: null },
];
const code = (fn: () => unknown) => {
  try { fn(); } catch (e) { return e instanceof QuoteInputError ? e.code : 'OTHER'; }
  return 'NONE';
};

describe('buildGazoblokQuote', () => {
  it('prices a block count from the catalog size', () => {
    const r = buildGazoblokQuote({ size: '600x300x200', quantity_blocks: 100, grade: 'D600' }, CATALOG);
    expect(r).toMatchObject({
      size: '600×300×200', thickness_cm: 20, grade: 'D600', blocks: 100, volume_m3: 3.6,
      price_per_block: 9500, total_price: 950000, currency: 'UZS', in_stock: true,
    });
    expect(r.price_per_m3).toBeGreaterThan(0);
  });
  it('turns a volume into whole blocks', () => {
    expect(buildGazoblokQuote({ thickness_cm: 20, volume_m3: 3.6 }, CATALOG).blocks).toBe(100);
    expect(buildGazoblokQuote({ thickness_cm: 20, volume_m3: 3.61 }, CATALOG).blocks).toBe(101);
  });
  it('turns a wall area into blocks with the CRM estimator (waste included)', () => {
    const expected = estimateWall(CATALOG[0], { lengthM: 10, heightM: 1 }).blocksNeeded;
    expect(buildGazoblokQuote({ thickness_cm: 20, wall_area_m2: 10 }, CATALOG).blocks).toBe(expected);
  });
  it('delivery is included only inside Yangiqo\'rg\'on, in any script', () => {
    expect(buildGazoblokQuote({ thickness_cm: 20, quantity_blocks: 10, district: 'Янгиқўрғон тумани' }, CATALOG).delivery_included).toBe(true);
    expect(buildGazoblokQuote({ thickness_cm: 20, quantity_blocks: 10, district: "Yangiqo'rg'on" }, CATALOG).delivery_included).toBe(true);
    expect(buildGazoblokQuote({ thickness_cm: 20, quantity_blocks: 10, district: 'Янгикурган' }, CATALOG).delivery_included).toBe(true);
    expect(buildGazoblokQuote({ thickness_cm: 20, quantity_blocks: 10, district: 'Namangan shahri' }, CATALOG).delivery_included).toBe(false);
    expect(buildGazoblokQuote({ thickness_cm: 20, quantity_blocks: 10 }, CATALOG).delivery_included).toBeNull();
  });
  it('in_stock is yes/no only: false when the order exceeds tracked stock, true when untracked', () => {
    expect(buildGazoblokQuote({ thickness_cm: 20, quantity_blocks: 600 }, CATALOG).in_stock).toBe(false);
    expect(buildGazoblokQuote({ thickness_cm: 30, quantity_blocks: 5000 }, CATALOG).in_stock).toBe(true);
  });
  it('refuses unknown sizes and ambiguous quantities', () => {
    expect(code(() => buildGazoblokQuote({ size: '600x250x100', quantity_blocks: 10 }, CATALOG))).toBe('UNKNOWN_SIZE');
    expect(code(() => buildGazoblokQuote({ thickness_cm: 25, quantity_blocks: 10 }, CATALOG))).toBe('UNKNOWN_SIZE');
    expect(code(() => buildGazoblokQuote({ quantity_blocks: 10 }, CATALOG))).toBe('INVALID_INPUT');
    expect(code(() => buildGazoblokQuote({ thickness_cm: 20 }, CATALOG))).toBe('INVALID_INPUT');
    expect(code(() => buildGazoblokQuote({ thickness_cm: 20, quantity_blocks: 10, volume_m3: 1 }, CATALOG))).toBe('INVALID_INPUT');
    expect(code(() => buildGazoblokQuote({ thickness_cm: 20, quantity_blocks: 2.5 }, CATALOG))).toBe('INVALID_INPUT');
  });
});
