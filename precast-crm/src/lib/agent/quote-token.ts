// Quote tokens — the price-integrity primitive (spec §4.2 / §6.1).
//
// A quote token is "<base64url(payloadJson)>.<base64url(hmacSha256(body))>".
// It binds a computed price to an HMAC signature, so a quote_id can be trusted
// WITHOUT being stored: a tampered payload or a forged price fails verification.
// If the payload carries a numeric `expiresAt`, expired tokens are rejected.

import { createHmac, timingSafeEqual } from 'crypto';

/** Encode a Buffer → URL-safe Base64 (no padding). */
function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode URL-safe Base64 back to a Buffer. Never throws (ignores bad chars). */
function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function sign(body: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(body).digest());
}

/** Sign a payload into a quote token. Throws if the secret is empty. */
export function mintQuoteToken(payload: object, secret: string): string {
  if (!secret) throw new Error('mintQuoteToken: secret is required');
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  return `${body}.${sign(body, secret)}`;
}

export interface VerifyQuoteOptions {
  /** Current time in ms; defaults to Date.now(). If the payload has a numeric
   *  `expiresAt`, a token at/after that time is rejected. */
  now?: number;
  /** Skip the expiry check (signature + structure only). Use ONLY where expiry
   *  is irrelevant — e.g. committing a staff-approved order whose quote may have
   *  aged past its customer-facing validity within the approval SLA; the order is
   *  re-priced live at placement, so this verifies provenance, not freshness. */
  ignoreExpiry?: boolean;
}

/**
 * Verify a quote token's signature (constant-time) and expiry, returning the
 * decoded payload — or null for any tampered / forged / expired / malformed
 * token, so callers can treat null as "untrusted, re-quote".
 */
export function verifyQuoteToken<T = unknown>(
  token: string | null | undefined,
  secret: string,
  opts?: VerifyQuoteOptions,
): T | null {
  if (!token || !secret) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  const expectedSig = sign(body, secret);
  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  // HMAC-SHA256 base64url output is always 43 chars — a length mismatch means a
  // structurally invalid token, not a secret-dependent branch (no timing oracle).
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(fromB64url(body).toString('utf8'));
  } catch {
    return null;
  }
  if (!opts?.ignoreExpiry && payload && typeof (payload as { expiresAt?: unknown }).expiresAt === 'number') {
    const now = opts?.now ?? Date.now();
    if (now >= (payload as { expiresAt: number }).expiresAt) return null;
  }
  return payload as T;
}
