// Instagram adapter config + webhook-signature verification. Creds are read from
// env at call time (mirrors TELEGRAM_BOT_TOKEN) so a missing value surfaces as a
// clear runtime error, never a build-time one.

import { createHmac, timingSafeEqual } from 'crypto';

export const igAccessToken = (): string => process.env.INSTAGRAM_ACCESS_TOKEN ?? '';
export const igVerifyToken = (): string => process.env.INSTAGRAM_VERIFY_TOKEN ?? '';
export const igAppSecret = (): string => process.env.INSTAGRAM_APP_SECRET ?? '';
/** Public HTTPS origin used to build media URLs Meta can fetch (Caddy serves /uploads). */
export const publicBaseUrl = (): string =>
  (process.env.PUBLIC_BASE_URL ?? 'https://etalontbm.uz').replace(/\/$/, '');

export const IG_GRAPH = 'https://graph.instagram.com/v21.0';

/**
 * Verify Meta's `x-hub-signature-256` header against the RAW request body
 * (HMAC-SHA256 with the app secret). Constant-time compare; fail-closed when the
 * header or secret is missing. The webhook is public, so this is the auth gate.
 */
export function verifyWebhookSignature(raw: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
