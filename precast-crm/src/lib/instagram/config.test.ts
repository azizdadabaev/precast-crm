import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { verifyWebhookSignature } from './config';

describe('verifyWebhookSignature', () => {
  const secret = 'app-secret';
  const raw = '{"object":"instagram"}';
  const good = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');

  it('accepts a correct signature', () => {
    expect(verifyWebhookSignature(raw, good, secret)).toBe(true);
  });
  it('rejects a wrong signature', () => {
    expect(verifyWebhookSignature(raw, 'sha256=deadbeef', secret)).toBe(false);
  });
  it('rejects a signature for a different body', () => {
    expect(verifyWebhookSignature('{"object":"x"}', good, secret)).toBe(false);
  });
  it('rejects a missing header or secret (fail-closed)', () => {
    expect(verifyWebhookSignature(raw, null, secret)).toBe(false);
    expect(verifyWebhookSignature(raw, good, '')).toBe(false);
  });
});
