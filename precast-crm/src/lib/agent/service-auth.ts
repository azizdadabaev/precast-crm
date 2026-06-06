// Service-account auth for the AI agent's server-to-server endpoints
// (the agent webhook + the /api/agent/approve callback). These run with no
// user session/PIN, so they authenticate with a single shared secret in the
// AGENT_SERVICE_TOKEN env var, compared in constant time. Spec §11.

import { timingSafeEqual } from 'crypto';

/** Constant-time equality of the provided token against the expected secret. */
export function isValidServiceToken(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on differing lengths — guard first. The early
  // length check is itself a (length-only) leak, which is acceptable for a
  // fixed-length service token.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Extract the token from an `Authorization: Bearer <token>` header value. */
export function serviceTokenFromAuthHeader(
  headerValue: string | null | undefined,
): string | null {
  if (!headerValue) return null;
  const prefix = 'Bearer ';
  if (!headerValue.startsWith(prefix)) return null;
  const token = headerValue.slice(prefix.length).trim();
  return token.length > 0 ? token : null;
}

/**
 * True iff the request's Authorization header carries the configured
 * AGENT_SERVICE_TOKEN. Pass `expected` explicitly in tests; in production it
 * defaults to the env var.
 */
export function authorizeServiceRequest(
  authHeader: string | null | undefined,
  expected: string | null | undefined = process.env.AGENT_SERVICE_TOKEN,
): boolean {
  return isValidServiceToken(serviceTokenFromAuthHeader(authHeader), expected);
}
