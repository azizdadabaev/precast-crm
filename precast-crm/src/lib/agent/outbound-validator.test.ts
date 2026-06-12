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

  it('allows the published STARTING RATE without a quote (the "dan boshlanadi" answer)', () => {
    const ctx = { hasFreshQuote: false, startingTierPrice: 140_000 };
    expect(validateOutbound("1 m² narxi 140 000 so'mdan boshlanadi 🙂", ctx)).toEqual({ ok: true });
    expect(validateOutbound('1 м² нархи 140 000 сўмдан бошланади', ctx)).toEqual({ ok: true });
    expect(validateOutbound("Narxi 140,000 so'm atrofida boshlanadi", ctx)).toEqual({ ok: true }); // comma grouping
  });

  it('still blocks any OTHER price without a quote, even when a starting rate exists', () => {
    const ctx = { hasFreshQuote: false, startingTierPrice: 140_000 };
    expect(validateOutbound("Jami 10 350 000 so'm chiqadi", ctx).ok).toBe(false);
    // Mixed: starting rate + an invented total → still blocked.
    expect(validateOutbound("140 000 so'mdan boshlanadi, jami 2 800 000 so'm bo'ladi", ctx).ok).toBe(false);
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

  it('blocks a link regardless of hasFreshQuote', () => {
    expect(validateOutbound('https://evil.com', { hasFreshQuote: false }).ok).toBe(false);
  });

  it('blocks a price written with no space before the currency word', () => {
    expect(validateOutbound("Narx: 300000so'm", { hasFreshQuote: false }).ok).toBe(false);
  });

  it('blocks an uppercase currency word (case-insensitive)', () => {
    expect(validateOutbound('450 000 SUM', { hasFreshQuote: false }).ok).toBe(false);
  });

  it('blocks an https link embedded mid-sentence', () => {
    expect(validateOutbound("Ko'proq uchun https://example.com sahifasiga kiring.", { hasFreshQuote: true }).ok).toBe(false);
  });
});
