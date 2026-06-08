import { describe, it, expect } from 'vitest';
import { buildVisionEcho } from './vision';
import { parseDimensions } from './llm/gemini';

describe('parseDimensions', () => {
  it('parses a clear high-confidence read', () => {
    const d = parseDimensions('{"found":true,"innerWidthM":5.2,"innerLengthM":4,"confidence":"high","note":"one room"}');
    expect(d).toEqual({ found: true, innerWidthM: 5.2, innerLengthM: 4, confidence: 'high', note: 'one room' });
  });

  it('tolerates a ```json code fence', () => {
    const d = parseDimensions('```json\n{"found":true,"innerWidthM":3,"innerLengthM":4,"confidence":"high"}\n```');
    expect(d.found).toBe(true);
    expect(d.confidence).toBe('high');
  });

  it('degrades a found result that is missing a dimension to not-found/low', () => {
    const d = parseDimensions('{"found":true,"innerWidthM":5,"innerLengthM":null,"confidence":"high"}');
    expect(d.found).toBe(false);
    expect(d.confidence).toBe('low');
  });

  it('returns low/not-found on unparseable output (never guesses)', () => {
    const d = parseDimensions('I think it is about 5 by 4 meters');
    expect(d).toEqual({ found: false, confidence: 'low', note: 'could not parse vision output' });
  });

  it('keeps low confidence as low even if found is true', () => {
    const d = parseDimensions('{"found":true,"innerWidthM":5,"innerLengthM":4,"confidence":"low"}');
    expect(d.confidence).toBe('low');
  });
});

describe('buildVisionEcho', () => {
  it('echoes the dimensions to confirm (no price) when the read is clear', () => {
    const r = buildVisionEcho({ found: true, innerWidthM: 5.2, innerLengthM: 4, confidence: 'high' }, 'uz-latin');
    expect(r.action).toBe('reply');
    if (r.action === 'reply') {
      expect(r.innerWidthM).toBe(5.2);
      expect(r.reply).toContain('5.2');
      expect(r.reply).toContain('4');
      expect(r.reply.toLowerCase()).not.toMatch(/so['’ʻ]?m|сум|narx|цена/); // never a price
    }
  });

  it('echoes in the conversation language', () => {
    const ru = buildVisionEcho({ found: true, innerWidthM: 3, innerLengthM: 4, confidence: 'high' }, 'ru');
    expect(ru.action === 'reply' && ru.reply).toContain('вижу');
  });

  it('escalates an unclear / low-confidence image (asks for typed dims)', () => {
    for (const dims of [
      { found: false, confidence: 'low' as const, note: 'no labels' },
      { found: true, innerWidthM: 5, innerLengthM: 4, confidence: 'low' as const },
    ]) {
      const r = buildVisionEcho(dims, 'uz-latin');
      expect(r.action).toBe('escalate');
    }
  });
});
