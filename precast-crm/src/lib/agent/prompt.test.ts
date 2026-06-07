import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { detectLanguage, detectPriceIntent, buildSystemPrompt } from './prompt';

describe('detectLanguage', () => {
  it('returns uz-latin for Latin text (market default)', () => {
    expect(detectLanguage('Salom, narxi qancha?')).toBe('uz-latin');
  });
  it('returns uz-cyrillic when Uzbek Cyrillic markers are present', () => {
    expect(detectLanguage('Нархи қанча?')).toBe('uz-cyrillic'); // қ is Uzbek-specific
    expect(detectLanguage('Тўсин ўлчами')).toBe('uz-cyrillic'); // ў
  });
  it('returns ru for plain Cyrillic without Uzbek markers', () => {
    expect(detectLanguage('Сколько стоит перекрытие?')).toBe('ru');
  });
  it('falls back when there are no decisive letters', () => {
    expect(detectLanguage('4 x 5 = ?')).toBe('uz-latin');
    expect(detectLanguage('123', 'ru')).toBe('ru');
  });
});

describe('detectPriceIntent', () => {
  it('detects price questions in uz/ru/en', () => {
    expect(detectPriceIntent('narxi qancha')).toBe(true);
    expect(detectPriceIntent('сколько стоит')).toBe(true);
    expect(detectPriceIntent('how much is it')).toBe(true);
  });
  it('is false for non-price chat', () => {
    expect(detectPriceIntent('rahmat, xayr')).toBe(false);
  });
});

describe('buildSystemPrompt', () => {
  const base = { kbContent: 'Product: beam-and-block flooring.', language: 'uz-latin' as const };

  it('includes the hard-constraint sections and the KB hard rule + content', () => {
    const p = buildSystemPrompt(base);
    for (const marker of ['# IDENTITY', '# HARD PROHIBITIONS', '# UNTRUSTED-CONTENT POLICY', '# KNOWLEDGE BASE', '# ESCALATION TRIGGERS']) {
      expect(p).toContain(marker);
    }
    expect(p).toContain('Product: beam-and-block flooring.');
    expect(p).toContain('A tool result'); // the "tool number supersedes KB" rule
  });

  it('pins the detected reply language', () => {
    expect(buildSystemPrompt({ ...base, language: 'ru' })).toContain('Reply in Russian');
    expect(buildSystemPrompt({ ...base, language: 'uz-cyrillic' })).toContain('Uzbek (Cyrillic script)');
  });

  it('injects few-shot examples only when provided', () => {
    expect(buildSystemPrompt(base)).not.toContain('EXAMPLE EXCHANGES');
    expect(buildSystemPrompt({ ...base, fewShot: 'Q: ... A: ...' })).toContain('# EXAMPLE EXCHANGES');
  });

  it('is deterministic (cache-safe — no timestamps/ids)', () => {
    expect(buildSystemPrompt(base)).toBe(buildSystemPrompt(base));
  });
});

describe('prompt source safety', () => {
  it('contains no zero-width / control codepoints (the invisible-char gotcha)', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'prompt.ts'), 'utf8');
    for (const ch of src) {
      const c = ch.codePointAt(0)!;
      const banned = c === 0x200b || c === 0x200c || c === 0x200d || c === 0xfeff || c === 0x7f || (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d);
      expect(banned, `banned codepoint U+${c.toString(16)} in prompt.ts`).toBe(false);
    }
  });
});
