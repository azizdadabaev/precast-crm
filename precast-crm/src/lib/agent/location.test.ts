import { describe, it, expect } from 'vitest';
import { detectLocationIntent, locationReplyText, COMPANY_LOCATION } from './location';
import { validateOutbound } from './outbound-validator';

describe('detectLocationIntent', () => {
  it('fires on clear location requests (uz / ru / en)', () => {
    for (const t of [
      'lokatsiya yuboring',
      'Manzilingiz qayerda?',
      'joylashuvingizni tashlang',
      'qayerdasiz',
      'xaritada qayerda',
      'gps yuboring',
      'где вы находитесь?',
      'ваш адрес?',
      'локацию скиньте',
      'как доехать до вас',
      'send me your location',
      'what is your address',
      'google maps',
    ]) {
      expect(detectLocationIntent(t)).toBe(true);
    }
  });

  it('does NOT fire on unrelated messages (no false trigger on quotes/cards)', () => {
    for (const t of [
      'narxi qancha 4x5',
      'yetkazib berasizmi',
      'mustahkammi',
      '3x4 xona kerak',
      'kartaga to\'lasam bo\'ladimi', // "card", not map
      'rahmat',
    ]) {
      expect(detectLocationIntent(t)).toBe(false);
    }
  });
});

describe('locationReplyText', () => {
  it('includes the address + maps link, localized', () => {
    const uz = locationReplyText('uz-latin');
    expect(uz).toContain(COMPANY_LOCATION.mapsUrl);
    expect(uz).toContain('eski TRZ');
    expect(locationReplyText('ru')).toContain('адрес');
    expect(locationReplyText('uz-cyrillic')).toContain('Манзил');
  });
});

describe('outbound validator — company location link', () => {
  it('allows the approved company Maps link', () => {
    expect(validateOutbound(locationReplyText('uz-latin'), { hasFreshQuote: false }).ok).toBe(true);
  });

  it('still blocks any OTHER link', () => {
    expect(validateOutbound('manzil: https://evil.example.com/x', { hasFreshQuote: false }).ok).toBe(false);
  });
});
