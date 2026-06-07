import { describe, it, expect } from 'vitest';
import { validateOutbound } from './outbound-validator';

describe('validateOutbound', () => {
  it('allows a plain message with no price and no link', () => {
    expect(validateOutbound('Salom! Qanday yordam bera olaman?', { hasFreshQuote: false })).toEqual({ ok: true });
  });

  it('blocks a price (digits + UZS currency word) when there is no fresh quote', () => {
    const v = validateOutbound("Jami narx: 300 000 so'm.", { hasFreshQuote: false });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/price/i);
  });

  it('allows the same price when a fresh quote was minted this turn', () => {
    expect(validateOutbound("Jami narx: 300 000 so'm.", { hasFreshQuote: true })).toEqual({ ok: true });
  });

  it('matches Russian/Cyrillic currency too', () => {
    expect(validateOutbound('Цена 450 000 сум', { hasFreshQuote: false }).ok).toBe(false);
  });

  it('does NOT treat a phone number, a room count, or a beam size as a price', () => {
    expect(validateOutbound('Telefon: +998 90 123 45 67', { hasFreshQuote: false })).toEqual({ ok: true });
    expect(validateOutbound('Sizda 5 xona bormi?', { hasFreshQuote: false })).toEqual({ ok: true });
    expect(validateOutbound("To'sin uzunligi 4.30 m", { hasFreshQuote: false })).toEqual({ ok: true });
  });

  it('blocks any outgoing link (the bot never sends links)', () => {
    expect(validateOutbound('Batafsil: https://example.com/x', { hasFreshQuote: true }).ok).toBe(false);
    expect(validateOutbound('Telegram: t.me/somechannel', { hasFreshQuote: true }).ok).toBe(false);
    expect(validateOutbound('Sayt: etalon.uz', { hasFreshQuote: true }).ok).toBe(false);
  });

  it('does not flag ordinary text that merely contains a dot', () => {
    expect(validateOutbound('Rahmat. Tez orada javob beramiz.', { hasFreshQuote: false })).toEqual({ ok: true });
  });
});
