// Pure token math for the call → Telegram handoff.
//
// Outbound Telegram requires a business_connection_id that only ever arrives on
// an INBOUND update, and Telegram never reveals the sender's phone number. So a
// short token rides in the customer's first message and is what links the phone
// call to the chat. See docs/superpowers/specs/2026-08-12-call-to-telegram-handoff-design.md
//
// No Prisma, no crypto side effects beyond randomness — exhaustively testable.

import { randomInt } from "node:crypto";

/**
 * Crockford base32: digits + letters minus I, L, O, U.
 *
 * I/L/O are dropped because they are confusable with 1/1/0 when a customer
 * retypes the token or reads it off a screen; U is dropped by the same standard
 * to avoid accidental profanity. 32^6 ≈ 1.07e9 combinations.
 */
export const TOKEN_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const TOKEN_LENGTH = 6;

/**
 * Matches a token as a standalone word so surrounding text does not break it —
 * the customer may send "Salom A7K2M9" or "a7k2m9 manzil kerak". Case-insensitive
 * because phone keyboards autocapitalize.
 *
 * The character class mirrors TOKEN_ALPHABET exactly (0-9, A-H, J-K, M-N, P-T,
 * V-Z). Keeping I/L/O/U OUT of the pattern is what stops ordinary six-letter
 * words ("SALOM", "KERAK" contain no excluded letters, but most do) from being
 * mistaken for tokens — and any false positive still has to hit a live row.
 */
const TOKEN_RE = new RegExp(`\\b[0-9A-HJ-KM-NP-TV-Z]{${TOKEN_LENGTH}}\\b`, "i");

/** Cryptographically-random token. Uniform — randomInt avoids modulo bias. */
export function generateToken(): string {
  let out = "";
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    out += TOKEN_ALPHABET[randomInt(TOKEN_ALPHABET.length)];
  }
  return out;
}

/**
 * Pull a candidate token out of an inbound message.
 *
 * Returns the UPPERCASED match, or null. A non-null result is only a candidate —
 * the caller must still find a PENDING, unexpired row with that token, so a
 * coincidental six-character word is harmless.
 */
export function extractToken(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = TOKEN_RE.exec(text);
  return m ? m[0].toUpperCase() : null;
}

/** True when `token` is exactly a well-formed token (no surrounding text). */
export function isWellFormedToken(token: string | null | undefined): boolean {
  if (!token || token.length !== TOKEN_LENGTH) return false;
  return token
    .toUpperCase()
    .split("")
    .every((c) => TOKEN_ALPHABET.includes(c));
}

/** Follow-ups stop being matchable after this long. */
export const TOKEN_TTL_DAYS = 7;

export function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}
