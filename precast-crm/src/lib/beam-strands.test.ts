import { describe, it, expect } from 'vitest';
import { beamStrands, isLongBeam, loadListLines } from './beam-strands';
import { M2_PRICE_TIERS } from '@/services/calculation-engine';

const room = (beamLength: number, m2Price: number, m2PriceOverride = false) => ({ beamLength, m2Price, m2PriceOverride });

describe('beamStrands', () => {
  it('follows the rate level: 140k → 4, 160k → 5, 180k → 5, 200k/230k → 6', () => {
    expect(beamStrands(room(3.8, 140_000), M2_PRICE_TIERS)).toBe(4);
    expect(beamStrands(room(5.2, 160_000), M2_PRICE_TIERS)).toBe(5);
    expect(beamStrands(room(6.3, 180_000), M2_PRICE_TIERS)).toBe(5);
    expect(beamStrands(room(7.0, 200_000), M2_PRICE_TIERS)).toBe(6);
    expect(beamStrands(room(8.2, 230_000), M2_PRICE_TIERS)).toBe(6);
  });
  it('a long beam the owner priced at the first rate gets 4 strands', () => {
    expect(beamStrands(room(5.2, 140_000, true), M2_PRICE_TIERS)).toBe(4);
  });
  it('a typed rate between levels takes the level at or below it', () => {
    expect(beamStrands(room(5.2, 150_000, true), M2_PRICE_TIERS)).toBe(4);
    expect(beamStrands(room(6.0, 170_000, true), M2_PRICE_TIERS)).toBe(5);
    expect(beamStrands(room(5.0, 120_000, true), M2_PRICE_TIERS)).toBe(4);
  });
  it('an auto-priced room follows its length bracket, so a later price change cannot move old orders', () => {
    const raised = M2_PRICE_TIERS.map((t) => ({ ...t, price: t.price + 30_000 }));
    expect(beamStrands(room(5.2, 160_000), raised)).toBe(5);
    expect(beamStrands(room(9.0, 230_000), raised)).toBe(6);
  });
});

describe('isLongBeam', () => {
  it('beams over 4,30 m are long; 4,30 m is not', () => {
    expect(isLongBeam(4.3)).toBe(false);
    expect(isLongBeam('4.30')).toBe(false);
    expect(isLongBeam(4.31)).toBe(true);
  });
});

describe('loadListLines', () => {
  it('one line per length and strand count, in room order', () => {
    expect(loadListLines([
      { beamLength: '3.8', beamCount: 6, strands: 4 },
      { beamLength: '5.2', beamCount: 20, strands: 4 },
      { beamLength: '3.80', beamCount: 4, strands: 4 },
      { beamLength: '5.2', beamCount: 14, strands: 5 },
      { beamLength: '6.3', beamCount: 3, strands: 5 },
    ])).toEqual([
      { beamLength: '3.80', strands: 4, totalCount: 10 },
      { beamLength: '5.20', strands: 4, totalCount: 20 },
      { beamLength: '5.20', strands: 5, totalCount: 14 },
      { beamLength: '6.30', strands: 5, totalCount: 3 },
    ]);
  });
  it('rooms without a strand count still group by length', () => {
    expect(loadListLines([
      { beamLength: '4.2', beamCount: 5 },
      { beamLength: '4.2', beamCount: 5, strands: null },
    ])).toEqual([{ beamLength: '4.20', strands: null, totalCount: 10 }]);
  });
  it('skips rooms without beams', () => {
    expect(loadListLines([{ beamLength: '4.2', beamCount: 0, strands: 4 }])).toEqual([]);
  });
});
