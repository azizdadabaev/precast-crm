import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { detectLanguage, detectConversationLanguage, detectPriceIntent, buildSystemPrompt } from './prompt';

describe('detectLanguage', () => {
  it('returns uz-latin for Latin text (market default)', () => {
    expect(detectLanguage('Salom, narxi qancha?')).toBe('uz-latin');
  });
  it('returns uz-cyrillic when Uzbek Cyrillic markers are present', () => {
    expect(detectLanguage('Нархи қанча?')).toBe('uz-cyrillic'); // қ is Uzbek-specific
    expect(detectLanguage('Тўсин ўлчами')).toBe('uz-cyrillic'); // ў
  });
  it('returns ru only on a POSITIVE Russian signal (words / ы)', () => {
    expect(detectLanguage('Сколько стоит перекрытие?')).toBe('ru');
    expect(detectLanguage('Здравствуйте')).toBe('ru');
    expect(detectLanguage('Вы доставляете?')).toBe('ru'); // ы — not in the Uzbek Cyrillic alphabet
  });
  it('treats casual Uzbek written in PLAIN Cyrillic as Uzbek, never Russian (the reported bug)', () => {
    // Customers substitute plain Russian letters for ў ғ қ ҳ — these are all Uzbek:
    expect(detectLanguage('Ассалому алейкум')).toBe('uz-cyrillic');
    expect(detectLanguage('Яхшимисиз')).toBe('uz-cyrillic');
    expect(detectLanguage('Рахмат')).toBe('uz-cyrillic');
    expect(detectLanguage('Канча булади')).toBe('uz-cyrillic');
    expect(detectLanguage('Балка керак эди')).toBe('uz-cyrillic');
    expect(detectLanguage('Кайерда')).toBe('uz-cyrillic');
  });
  it('defaults uncertain Cyrillic to Uzbek (never "Cyrillic = Russian")', () => {
    expect(detectLanguage('Балка')).toBe('uz-cyrillic'); // ambiguous word, Uzbekistan default
  });
  it('lets an Uzbek signal win over an incidental Russian-looking word', () => {
    expect(detectLanguage('Балка канча стоит')).toBe('uz-cyrillic'); // канча (uz) beats стоит (ru)
  });
  it('falls back when there are no decisive letters', () => {
    expect(detectLanguage('4 x 5 = ?')).toBe('uz-latin');
    expect(detectLanguage('123', 'ru')).toBe('ru');
  });
});

describe('detectConversationLanguage', () => {
  const u = (content: string) => ({ role: 'user' as const, content });
  const a = (content: string) => ({ role: 'assistant' as const, content });

  it('uses the current message when it carries a real word (honors a mid-chat switch)', () => {
    expect(detectConversationLanguage('Сколько стоит?', [u('Salom')])).toBe('ru');
    expect(detectConversationLanguage('Narxi qancha?', [u('Сколько?')])).toBe('uz-latin');
  });

  it('keeps the conversation language when the message is digits-only dimensions (the bug)', () => {
    // Customer established Russian; then sends only numbers — reply must stay ru,
    // not drift to the uz-latin default.
    const history = [u('Здравствуйте'), a('Здравствуйте! Чем помочь?'), u('Сколько стоит перекрытие?')];
    expect(detectConversationLanguage('4x5', history)).toBe('ru');
    expect(detectConversationLanguage('4 5 3', history)).toBe('ru');
    expect(detectConversationLanguage('5.2 x 4.0', history)).toBe('ru');
  });

  it('does not treat a stray dimension "x" as an Uzbek-Latin language signal', () => {
    expect(detectConversationLanguage('4x5', [u('Нархи қанча?')])).toBe('uz-cyrillic');
  });

  it('determines language from the customer, ignoring our own (possibly wrong) replies', () => {
    // Even if a prior assistant turn drifted to Uzbek, the customer's language wins.
    const history = [u('Сколько стоит?'), a('Narxi ... (drifted)')];
    expect(detectConversationLanguage('4x5', history)).toBe('ru');
  });

  it('uses the most recent decisive customer turn (latest language wins)', () => {
    const history = [u('Сколько стоит?'), u('Narxi qancha?')];
    expect(detectConversationLanguage('4x5', history)).toBe('uz-latin');
  });

  it('falls back to the default when neither the message nor history is decisive', () => {
    expect(detectConversationLanguage('4x5', [])).toBe('uz-latin');
    expect(detectConversationLanguage('123', [u('456')])).toBe('uz-latin');
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

  it('always includes the built-in persona few-shot, and appends owner-provided examples', () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain('# EXAMPLE EXCHANGES'); // built-in persona few-shot is always present
    expect(p).toContain('RADIOACTIVE'); // the never-send-verbatim guard
    expect(p).toContain("1 m² <BOSHLANG_ICH_NARX> so'mdan boshlanadi"); // a persona example
    // Owner few-shot is appended after the built-in block.
    expect(buildSystemPrompt({ ...base, fewShot: 'Q: owner-line A: owner-ans' })).toContain('owner-line');
  });

  it('is deterministic (cache-safe — no timestamps/ids)', () => {
    expect(buildSystemPrompt(base)).toBe(buildSystemPrompt(base));
  });

  it('defaults unspecified enquiries to beam-and-block (ad traffic)', () => {
    expect(buildSystemPrompt(base)).toContain('# DEFAULT PRODUCT — ASSUME BEAM-AND-BLOCK');
  });

  it('injects the live starting rate (formatted, with the tier beam length) when provided', () => {
    const p = buildSystemPrompt({ ...base, startingTier: { price: 140_000, maxBeamLengthM: 4.3 } });
    expect(p).toContain('# STARTING RATE');
    expect(p).toContain("starts at 140 000 so'm per m²");
    expect(p).toContain('beam length up to 4,3 m');
    expect(p).toContain('dan boshlanadi');
    // The informative line is about BEAM LENGTH, not an unsolicited product
    // comparison — owner disliked "cheaper than pustotka" on every reply.
    expect(p).toContain('balka uzunligiga qarab');
    expect(p).not.toMatch(/cheaper than hollow-core/i);
    // Determinism holds with the tier too (prompt cache safety).
    expect(p).toBe(buildSystemPrompt({ ...base, startingTier: { price: 140_000, maxBeamLengthM: 4.3 } }));
  });

  it('omits the starting-rate section when no tier is provided', () => {
    expect(buildSystemPrompt(base)).not.toContain('# STARTING RATE');
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
