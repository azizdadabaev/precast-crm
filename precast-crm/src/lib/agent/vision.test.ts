import { describe, it, expect } from 'vitest';
import { describeExtractedRooms, visionFallbackReply, mediaCorrectionNote } from './vision';
import { parseDimensions, betterDimensions } from './llm/gemini';
import type { ExtractedDimensions } from './llm/provider';

describe('betterDimensions (primary vs retry pass selection)', () => {
  const D = (found: boolean, confidence: 'high' | 'low', n: number): ExtractedDimensions => ({
    found,
    confidence,
    rooms: Array.from({ length: n }, () => ({ widthM: 3, lengthM: 4 })),
  });

  it('prefers a found read over a not-found one', () => {
    expect(betterDimensions(D(false, 'low', 0), D(true, 'low', 1))).toMatchObject({ found: true });
  });
  it('prefers high confidence when both found', () => {
    expect(betterDimensions(D(true, 'low', 5), D(true, 'high', 1)).confidence).toBe('high');
  });
  it('prefers more rooms on an equal found+confidence tie', () => {
    expect(betterDimensions(D(true, 'high', 2), D(true, 'high', 4)).rooms).toHaveLength(4);
  });
  it('keeps the primary when the retry is no better', () => {
    const primary = D(true, 'high', 3);
    expect(betterDimensions(primary, D(false, 'low', 0))).toBe(primary);
  });
});

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

describe('describeExtractedRooms', () => {
  it('renders a single room as a customer-style dimensions question (no price)', () => {
    const t = describeExtractedRooms([{ widthM: 5.2, lengthM: 4 }], 'uz-latin');
    expect(t).toContain('5.2×4 m');
    expect(t).toContain('Narxi qancha?');
    expect(t.toLowerCase()).not.toMatch(/so['’ʻ]?m|сум|цена/); // dims question, never a price
  });

  it('lists every room for a multi-room plan', () => {
    const t = describeExtractedRooms([{ widthM: 3.8, lengthM: 3.8 }, { widthM: 3.8, lengthM: 7.5 }], 'uz-latin');
    expect(t).toContain('3.8×3.8 m');
    expect(t).toContain('3.8×7.5 m');
  });

  it('uses the conversation language', () => {
    expect(describeExtractedRooms([{ widthM: 3, lengthM: 4 }], 'ru')).toContain('Сколько стоит');
    expect(describeExtractedRooms([{ widthM: 3, lengthM: 4 }], 'uz-cyrillic')).toContain('Нархи қанча');
  });
});

describe('visionFallbackReply', () => {
  it('asks for typed dimensions in the conversation language', () => {
    expect(visionFallbackReply('uz-latin')).toContain('4×5 m');
    expect(visionFallbackReply('ru')).toContain('чертёж');
    expect(visionFallbackReply('uz-cyrillic')).toContain('4×5 m');
  });
});

describe('mediaCorrectionNote', () => {
  it('lists the dimensions and uses drawing wording for an image source', () => {
    const t = mediaCorrectionNote([{ innerWidth: 4, innerLength: 6 }, { innerWidth: 4, innerLength: 4 }], 'uz-latin', 'image');
    expect(t).toContain('4×6 m');
    expect(t).toContain('4×4 m');
    expect(t.toLowerCase()).toContain('chizma'); // "drawing" wording
    expect(t.toLowerCase()).toContain('xato'); // invites a correction
  });

  it('uses voice wording for a voice source', () => {
    const t = mediaCorrectionNote([{ innerWidth: 3, innerLength: 5 }], 'uz-latin', 'voice');
    expect(t).toContain('3×5 m');
    expect(t.toLowerCase()).toContain('ovoz'); // "voice" wording
  });

  it('localizes the note (ru / uz-cyrillic)', () => {
    expect(mediaCorrectionNote([{ innerWidth: 3, innerLength: 4 }], 'ru', 'image')).toContain('чертеж');
    expect(mediaCorrectionNote([{ innerWidth: 3, innerLength: 4 }], 'uz-cyrillic', 'voice')).toContain('Овозли');
  });
});
