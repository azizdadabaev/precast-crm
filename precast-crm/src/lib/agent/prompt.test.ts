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
  it('reads the -mi particle as Uzbek and ignores loanwords like dostavka (the reported bug)', () => {
    expect(detectLanguage('Доставка борми')).toBe('uz-cyrillic'); // борми (uz -mi); доставка is a loanword, not ru
    expect(detectLanguage('Бор')).toBe('uz-cyrillic');
    expect(detectLanguage('Доставка?')).toBe('uz-cyrillic'); // a bare loanword defaults to Uzbek now
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

  it('does not flip an established Uzbek chat to Russian on a weak single word', () => {
    // One Russian-ish word, no ы, in an Uzbek conversation → stay Uzbek.
    expect(detectConversationLanguage('Можно?', [u('Нархи қанча?')])).toBe('uz-cyrillic');
  });

  it('still switches to Russian when the customer clearly writes Russian', () => {
    expect(detectConversationLanguage('Сколько стоит, когда привезёте?', [u('Нархи қанча?')])).toBe('ru');
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

  it('includes the CONTACT section with the sales team phone numbers', () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain('# CONTACT — PHONE / CALLS');
    expect(p).toContain('+998 93 481 33 30'); // Azizbek
    expect(p).toContain('+998 94 306 09 70'); // Ulug'bek
    expect(p).toContain('+998 93 676 15 88'); // Tursunboy
  });

  it('tells the agent to count every room via the tool (the under-counted-draft bug)', () => {
    // Identical rooms must be passed as `count`, or the saved draft holds one room
    // per distinct size while the text shows the full multi-room total.
    expect(buildSystemPrompt(base)).toContain('COUNT EVERY ROOM via the tool');
  });

  it('pins the detected reply language', () => {
    expect(buildSystemPrompt({ ...base, language: 'ru' })).toContain('Reply in Russian');
    expect(buildSystemPrompt({ ...base, language: 'uz-cyrillic' })).toContain('Uzbek (Cyrillic script)');
  });

  it('always includes the built-in persona few-shot, and appends owner-provided examples', () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain('# EXAMPLE EXCHANGES'); // built-in persona few-shot is always present
    expect(p).toContain('RADIOACTIVE'); // the never-send-verbatim guard
    expect(p).toContain("Narxlar o'zgardimi?"); // the terse persona few-shot ("Yo'q.")
    // Owner few-shot is appended after the built-in block.
    expect(buildSystemPrompt({ ...base, fewShot: 'Q: owner-line A: owner-ans' })).toContain('owner-line');
  });

  it('is deterministic (cache-safe — no timestamps/ids)', () => {
    expect(buildSystemPrompt(base)).toBe(buildSystemPrompt(base));
  });

  it('defaults unspecified enquiries to beam-and-block (ad traffic)', () => {
    expect(buildSystemPrompt(base)).toContain('# DEFAULT PRODUCT — ASSUME BEAM-AND-BLOCK');
  });

  it('injects the live starting rate and keeps the no-dimensions answer CONCISE', () => {
    const p = buildSystemPrompt({ ...base, startingTier: { price: 140_000, maxBeamLengthM: 4.3 } });
    expect(p).toContain('# STARTING RATE');
    expect(p).toContain("starts at 140 000 so'm per m²");
    expect(p).toContain('dan boshlanadi');
    // Owner wants it short: just price + dimensions ask, no beam-length tier
    // parenthetical and no product comparison on every reply.
    expect(p).toContain('two short lines');
    expect(p).not.toMatch(/cheaper than hollow-core/i);
    expect(p).not.toContain('lowest for shorter spans');
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
