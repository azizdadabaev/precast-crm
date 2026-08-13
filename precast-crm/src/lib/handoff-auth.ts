// Device-token authentication for POST /api/handoff.
//
// The Android overlay app has no browser cookie, so it authenticates with a
// single shared secret sent as `Authorization: Bearer <token>`. That secret
// lives on a phone that can be lost or stolen, so its blast radius is
// deliberately one capability: create a PendingFollowUp row. It is NOT a user
// session and must never be accepted anywhere else.
// See docs/superpowers/specs/2026-08-12-call-to-telegram-handoff-design.md §4.2

import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

const BEARER_PREFIX = "Bearer ";

/**
 * The configured secret, or null when it is unset/blank. A whitespace-only
 * value counts as unset — otherwise a half-filled .env would silently become a
 * guessable credential.
 */
function expectedDeviceToken(): string | null {
  const t = process.env.HANDOFF_DEVICE_TOKEN?.trim();
  return t ? t : null;
}

/** Diagnostics only — never reveals the token itself. */
export function deviceTokenConfigured(): boolean {
  return expectedDeviceToken() !== null;
}

function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * True only when the request carries the exact configured device token.
 *
 * Compared as SHA-256 digests so `timingSafeEqual` always receives two 32-byte
 * buffers: it throws a RangeError on differing lengths, and comparing raw
 * strings would also leak the secret's length through that failure mode.
 *
 * Fails closed: no `HANDOFF_DEVICE_TOKEN` means no request is ever authorized.
 * "Not configured" must never read as "open".
 */
export function verifyDeviceToken(req: NextRequest): boolean {
  const expected = expectedDeviceToken();
  if (!expected) return false;

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith(BEARER_PREFIX)) return false;

  const provided = auth.slice(BEARER_PREFIX.length).trim();
  if (!provided) return false;

  return timingSafeEqual(sha256(provided), sha256(expected));
}
