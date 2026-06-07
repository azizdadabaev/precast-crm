import { describe, it, expect } from 'vitest';
import {
  runCheckStock,
  availabilityFromQuantity,
  checkStockDefinition,
  type CheckStockDeps,
} from './check-stock';

const DEPS: CheckStockDeps = {
  floor: [
    { kind: 'BEAM', beamLengthM: 4.3, quantity: 200, lowStockThreshold: 10 },
    { kind: 'BEAM', beamLengthM: 5.3, quantity: 5, lowStockThreshold: 10 },
    { kind: 'BLOCK', beamLengthM: null, quantity: 0, lowStockThreshold: 50 },
  ],
  gazoblok: [
    { thicknessMm: 200, label: '600×300×200', quantity: 1000, lowStockThreshold: 50 },
    { thicknessMm: 300, label: '600×300×300', quantity: 30, lowStockThreshold: 50 },
  ],
};

describe('availabilityFromQuantity', () => {
  it('buckets by the low-stock threshold', () => {
    expect(availabilityFromQuantity(100, 50)).toBe('in_stock'); // > threshold
    expect(availabilityFromQuantity(50, 50)).toBe('low'); // == threshold
    expect(availabilityFromQuantity(1, 50)).toBe('low');
    expect(availabilityFromQuantity(0, 50)).toBe('out_of_stock');
    expect(availabilityFromQuantity(-3, 50)).toBe('out_of_stock'); // negative stock allowed → out
  });
});

describe('runCheckStock', () => {
  it('reports a well-stocked beam as in_stock with no lead time', () => {
    const res = runCheckStock({ line: 'floor', kind: 'BEAM', beam_length_m: 4.3 }, DEPS);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.availability).toBe('in_stock');
      expect(res.data.leadTimeApplies).toBe(false);
      expect(res.data.item).toBe('BEAM 4.30m');
    }
  });

  it('reports a thin beam as low with a lead time, and never leaks a count', () => {
    const res = runCheckStock({ line: 'floor', kind: 'BEAM', beam_length_m: 5.3 }, DEPS);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.availability).toBe('low');
      expect(res.data.leadTimeApplies).toBe(true);
      // The coarse status carries NO raw on-hand quantity field for the model to quote.
      expect(Object.keys(res.data)).not.toContain('quantity');
      expect(res.data).not.toHaveProperty('quantity');
    }
  });

  it('reports the BLOCK row (out of stock here)', () => {
    const res = runCheckStock({ line: 'floor', kind: 'BLOCK' }, DEPS);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.availability).toBe('out_of_stock');
  });

  it('checks gazoblok by thickness', () => {
    const inStock = runCheckStock({ line: 'gazoblok', thickness_mm: 200 }, DEPS);
    const low = runCheckStock({ line: 'gazoblok', thickness_mm: 300 }, DEPS);
    expect(inStock.ok && inStock.data.availability).toBe('in_stock');
    expect(low.ok && low.data.availability).toBe('low');
  });

  it('escalates when the item is not tracked', () => {
    expect(runCheckStock({ line: 'floor', kind: 'BEAM', beam_length_m: 9.9 }, DEPS)).toMatchObject({ ok: false, escalate: true });
    expect(runCheckStock({ line: 'gazoblok', thickness_mm: 999 }, DEPS)).toMatchObject({ ok: false, escalate: true });
  });

  it('escalates on invalid input (missing required selectors)', () => {
    expect(runCheckStock({ line: 'floor' }, DEPS)).toMatchObject({ ok: false, escalate: true });
    expect(runCheckStock({ line: 'floor', kind: 'BEAM' }, DEPS)).toMatchObject({ ok: false, escalate: true });
    expect(runCheckStock({ line: 'gazoblok' }, DEPS)).toMatchObject({ ok: false, escalate: true });
    expect(runCheckStock({}, DEPS)).toMatchObject({ ok: false, escalate: true });
  });
});

describe('checkStockDefinition', () => {
  it('forbids delivery dates / exact counts in its description', () => {
    const d = checkStockDefinition.description.toLowerCase();
    expect(d).toContain('date');
    expect(d).toContain('escalate');
  });
});
