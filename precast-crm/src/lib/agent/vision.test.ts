import { describe, it, expect } from 'vitest';
import { buildVisionEcho } from './vision';
import { parseDimensions } from './llm/gemini';

describe('parseDimensions', () => {
  it('parses multiple rooms (the common floor-plan case)', () => {
    const d = parseDimensions('{"found":true,"rooms":[{"widthM":3.8,"lengthM":3.8},{"widthM":3.8,"lengthM":7.5}],"confidence":"high"}');
    expect(d.found).toBe(true);
    expect(d.confidence).toBe('high');
    expect(d.rooms).toEqual([
      { widthM: 3.8, lengthM: 3.8, label: undefined },
      { widthM: 3.8, lengthM: 7.5, label: undefined },
    ]);
  });

  it('parses a single clear room', () => {
    const d = parseDimensions('{"found":true,"rooms":[{"widthM":5.2,"lengthM":4,"label":"xona"}],"confidence":"high"}');
    expect(d.found).toBe(true);
    expect(d.rooms).toEqual([{ widthM: 5.2, lengthM: 4, label: 'xona' }]);
  });

  it('tolerates a ```json code fence', () => {
    const d = parseDimensions('```json\n{"found":true,"rooms":[{"widthM":3,"lengthM":4}],"confidence":"high"}\n```');
    expect(d.found).toBe(true);
  });

  it('drops rooms with a missing/invalid dimension; not-found if none remain', () => {
    const d = parseDimensions('{"found":true,"rooms":[{"widthM":5,"lengthM":null},{"widthM":0,"lengthM":4}],"confidence":"high"}');
    expect(d.found).toBe(false);
    expect(d.rooms).toEqual([]);
  });

  it('returns low/not-found on unparseable output (never guesses)', () => {
    const d = parseDimensions('about 5 by 4 meters');
    expect(d).toEqual({ found: false, rooms: [], confidence: 'low', note: 'could not parse vision output' });
  });

  it('keeps low confidence as low even with rooms present', () => {
    const d = parseDimensions('{"found":true,"rooms":[{"widthM":5,"lengthM":4}],"confidence":"low"}');
    expect(d.confidence).toBe('low');
  });
});

describe('buildVisionEcho', () => {
  it('echoes a single room to confirm (no price)', () => {
    const r = buildVisionEcho({ found: true, rooms: [{ widthM: 5.2, lengthM: 4 }], confidence: 'high' }, 'uz-latin');
    expect(r.action).toBe('reply');
    if (r.action === 'reply') {
      expect(r.rooms).toHaveLength(1);
      expect(r.reply).toContain('5.2');
      expect(r.reply).toContain('4');
      expect(r.reply.toLowerCase()).not.toMatch(/so['’ʻ]?m|сум|narx|цена/); // never a price
    }
  });

  it('echoes ALL rooms for a multi-room plan (the reported 3.8×3.8 + 3.8×7.5 case)', () => {
    const r = buildVisionEcho(
      { found: true, rooms: [{ widthM: 3.8, lengthM: 3.8 }, { widthM: 3.8, lengthM: 7.5 }], confidence: 'high' },
      'uz-latin',
    );
    expect(r.action).toBe('reply');
    if (r.action === 'reply') {
      expect(r.rooms).toHaveLength(2);
      expect(r.reply).toContain('2 ta');
      expect(r.reply).toContain('3.8 × 3.8 m');
      expect(r.reply).toContain('3.8 × 7.5 m');
    }
  });

  it('echoes in the conversation language', () => {
    const ru = buildVisionEcho({ found: true, rooms: [{ widthM: 3, lengthM: 4 }], confidence: 'high' }, 'ru');
    expect(ru.action === 'reply' && ru.reply).toContain('вижу');
  });

  it('escalates an unclear / low-confidence image (asks for typed dims)', () => {
    for (const dims of [
      { found: false, rooms: [], confidence: 'low' as const, note: 'no labels' },
      { found: true, rooms: [{ widthM: 5, lengthM: 4 }], confidence: 'low' as const },
    ]) {
      expect(buildVisionEcho(dims, 'uz-latin').action).toBe('escalate');
    }
  });
});
