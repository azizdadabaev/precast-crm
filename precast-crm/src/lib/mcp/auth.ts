import { createHash, timingSafeEqual } from 'crypto';

/**
 * Validates the Authorization: Bearer <token> header against MCP_API_TOKEN.
 *
 * Uses SHA-256 digests for comparison so timingSafeEqual always receives
 * equal-length buffers (the RangeError it throws on length mismatch is a
 * common footgun with raw token comparison).
 *
 * Fails closed: returns false if MCP_API_TOKEN is unset.
 */
export function checkBearer(req: Request): boolean {
  const expected = process.env.MCP_API_TOKEN;
  if (!expected) return false;

  // Header takes priority; fall back to ?token= query param (for Claude.ai
  // custom connectors whose UI only accepts a URL, not custom headers).
  const auth = req.headers.get('Authorization') ?? '';
  const headerToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const queryToken = new URL(req.url).searchParams.get('token') ?? '';
  const provided = headerToken || queryToken;
  if (!provided) return false;

  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
