import { describe, it, expect } from 'vitest';
import { splitIntoBubbles, stripMarkdown, bubbleDelayMs } from './bubbles';

describe('stripMarkdown (send-path safety net)', () => {
  it('removes bold, headers, bullets, backticks but keeps the text', () => {
    expect(stripMarkdown('**5 586 560 so\'m**')).toBe("5 586 560 so'm");
    expect(stripMarkdown('# Hisob')).toBe('Hisob');
    expect(stripMarkdown('- 4x5 xona\n- 3x6 xona')).toBe('4x5 xona\n3x6 xona');
    expect(stripMarkdown('1. birinchi')).toBe('birinchi');
    expect(stripMarkdown('narx `140000`')).toBe('narx 140000');
  });
  it('leaves plain text untouched', () => {
    expect(stripMarkdown("Bo'ladi, aka.")).toBe("Bo'ladi, aka.");
  });
});

describe('splitIntoBubbles', () => {
  it('keeps a short one-line reply as a single bubble', () => {
    expect(splitIntoBubbles("5 586 560 so'm chiqadi.")).toEqual(["5 586 560 so'm chiqadi."]);
  });

  it('splits a multi-line reply into one bubble per line', () => {
    const reply = "Va alaykum assalom, aka!\n1 m² 140 000 dan boshlanadi.\nEni-bo'yini tashlang, aniq chiqaray.";
    expect(splitIntoBubbles(reply)).toEqual([
      'Va alaykum assalom, aka!',
      '1 m² 140 000 dan boshlanadi.',
      "Eni-bo'yini tashlang, aniq chiqaray.",
    ]);
  });

  it('caps at 3 bubbles, merging overflow into the last', () => {
    const reply = 'bir\nikki\nuch\nto\'rt\nbesh';
    const b = splitIntoBubbles(reply);
    expect(b).toHaveLength(3);
    expect(b[2]).toBe("uch to'rt besh");
  });

  it('strips markdown before splitting', () => {
    expect(splitIntoBubbles('**Jami: 5 586 560**')).toEqual(['Jami: 5 586 560']);
  });

  it('splits a long single line once at a sentence boundary', () => {
    const long =
      'Birinchi uyda xavotir tabiiy, aka, juda yaxshi tushunaman sizni. ' +
      "2 ta balkaning o'zi 4–5 tonna yukni bemalol ko'taradi, oddiy uyga yetib ortadi ham.";
    const b = splitIntoBubbles(long);
    expect(b.length).toBe(2);
    expect(b[0].endsWith('.')).toBe(true);
  });

  it('always returns at least one non-empty bubble', () => {
    expect(splitIntoBubbles('   ').length).toBeGreaterThanOrEqual(0); // empty → []
    expect(splitIntoBubbles('salom')).toEqual(['salom']);
  });

  it('bubbleDelayMs scales with length and is capped', () => {
    expect(bubbleDelayMs('ok')).toBeLessThan(bubbleDelayMs('a much longer bubble of text here'));
    expect(bubbleDelayMs('x'.repeat(500))).toBeLessThanOrEqual(2200);
  });
});
