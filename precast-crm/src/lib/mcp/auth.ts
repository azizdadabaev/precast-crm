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

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;

  const provided = auth.slice(7);
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
