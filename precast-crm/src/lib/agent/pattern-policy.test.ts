import { describe, it, expect } from 'vitest';
import { applyAgentPatternPolicy } from './pattern-policy';
import { calculateSlab, PITCH, type SlabInput } from '@/services/calculation-engine';

describe('applyAgentPatternPolicy', () => {
  it('rounds an auto-Г-Б-Г room up to Г-Б at the next full pitch', () => {
    // inner_length 5.6 → floor 9 pitches, R=0.38 → auto-pick GBG
    const out = applyAgentPatternPolicy({ inner_width: 3.4, inner_length: 5.6 });
    expect(out.pattern).toBe('GB');
    expect(out.inner_length).toBe(5.6); // customer's length is NEVER changed
    expect(out.correction).toBeCloseTo(0.2, 3);

    const r = calculateSlab(out);
    expect(r.pattern).toBe('GB');
    expect(r.pitches).toBe(10); // rounded up from 9
    expect(r.monolith_length).toBeCloseTo(10 * PITCH, 3); // 5.80 m
  });

  it('leaves a naturally Б-Г-Б room untouched', () => {
    // 5.3 → floor 9, R=0.08 → BGB
    const input: SlabInput = { inner_width: 3, inner_length: 5.3 };
    expect(applyAgentPatternPolicy(input)).toEqual(input);
  });

  it('leaves a naturally Г-Б room (R=0) untouched', () => {
    // 5.22 = 9 × 0.58 exactly → R=0 → GB
    const input: SlabInput = { inner_width: 3, inner_length: 5.22 };
    expect(applyAgentPatternPolicy(input)).toEqual(input);
  });

  it('leaves a round-up Г-Б room (R>0.45) untouched — the engine already bumps it', () => {
    // 5.75 → floor 9, R=0.53 → auto GB at N+1; pattern_auto is already GB
    const input: SlabInput = { inner_width: 3, inner_length: 5.75 };
    expect(applyAgentPatternPolicy(input)).toEqual(input);
  });

  it('respects an explicit pattern — even an explicit Г-Б-Г', () => {
    const input: SlabInput = { inner_width: 3, inner_length: 5.6, pattern: 'GBG' };
    expect(applyAgentPatternPolicy(input)).toEqual(input);
  });

  it('is idempotent (re-applying the converted room is a no-op)', () => {
    const once = applyAgentPatternPolicy({ inner_width: 3.4, inner_length: 5.6 });
    const twice = applyAgentPatternPolicy(once);
    expect(twice).toEqual(once); // explicit GB now set → respected, unchanged
  });
});
