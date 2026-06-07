import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { mintQuoteToken, verifyQuoteToken } from './quote-token';

const SECRET = 'quote-secret-key';

describe('mintQuoteToken / verifyQuoteToken', () => {
  it('round-trips a payload and recovers it exactly', () => {
    const payload = { kind: 'slab', price: 123456, expiresAt: 9_999_999_999_999 };
    const token = mintQuoteToken(payload, SECRET);
    expect(typeof token).toBe('string');
    expect(token).toContain('.');
    expect(verifyQuoteToken(token, SECRET, { now: 1000 })).toEqual(payload);
  });

  it('rejects a token whose payload was tampered with', () => {
    const token = mintQuoteToken({ price: 100 }, SECRET);
    const [, sig] = token.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ price: 999999 }), 'utf8')
      .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(verifyQuoteToken(`${forgedBody}.${sig}`, SECRET)).toBeNull();
  });

  it('rejects a token signed with a different secret (a forged price is rejected)', () => {
    const token = mintQuoteToken({ price: 100 }, 'attacker-secret');
    expect(verifyQuoteToken(token, SECRET)).toBeNull();
  });

  it('rejects an expired token (now > expiresAt) but accepts it before expiry', () => {
    const token = mintQuoteToken({ price: 1, expiresAt: 5000 }, SECRET);
    expect(verifyQuoteToken(token, SECRET, { now: 4999 })).toEqual({ price: 1, expiresAt: 5000 });
    expect(verifyQuoteToken(token, SECRET, { now: 5000 })).toBeNull(); // exact boundary: >= rejects
    expect(verifyQuoteToken(token, SECRET, { now: 5001 })).toBeNull();
  });

  it('accepts a payload with no expiresAt regardless of now', () => {
    const token = mintQuoteToken({ price: 42 }, SECRET);
    expect(verifyQuoteToken(token, SECRET, { now: Number.MAX_SAFE_INTEGER })).toEqual({ price: 42 });
  });

  it('returns null when the body decodes but is not valid JSON (signature still valid)', () => {
    const badBody = Buffer.from('not-json', 'utf8').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const sig = createHmac('sha256', SECRET).update(badBody).digest().toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(verifyQuoteToken(`${badBody}.${sig}`, SECRET)).toBeNull();
  });

  it('returns null for malformed / empty input and never throws', () => {
    expect(verifyQuoteToken(null, SECRET)).toBeNull();
    expect(verifyQuoteToken(undefined, SECRET)).toBeNull();
    expect(verifyQuoteToken('', SECRET)).toBeNull();
    expect(verifyQuoteToken('no-dot-here', SECRET)).toBeNull();
    expect(verifyQuoteToken('body.', SECRET)).toBeNull();
    expect(verifyQuoteToken('.sig', SECRET)).toBeNull();
    expect(verifyQuoteToken('a.b', '')).toBeNull();
  });

  it('mintQuoteToken throws when the secret is empty', () => {
    expect(() => mintQuoteToken({ price: 1 }, '')).toThrow();
  });

  it('ignoreExpiry verifies signature only (accepts an expired but authentic token)', () => {
    const token = mintQuoteToken({ price: 1, expiresAt: 5000 }, SECRET);
    expect(verifyQuoteToken(token, SECRET, { now: 9999 })).toBeNull(); // expired → rejected
    expect(verifyQuoteToken(token, SECRET, { now: 9999, ignoreExpiry: true })).toEqual({ price: 1, expiresAt: 5000 });
    // still rejects a forged token even with ignoreExpiry
    expect(verifyQuoteToken(mintQuoteToken({ price: 1 }, 'attacker'), SECRET, { ignoreExpiry: true })).toBeNull();
  });
});
