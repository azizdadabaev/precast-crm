// In-memory stash for operator photos sent to the bot that are waiting on the
// order number and/or the kind button. One active session per sender (keyed by
// Telegram `fromId`); an album accumulates into the same session. Sessions are
// transient — like the agent's other in-memory state, a server restart drops
// them and the operator simply re-sends. Lazy TTL expiry keeps the maps small.
//
// Pure + side-effect free (no Telegram / DB), so the whole stash/lookup/take
// lifecycle is unit-testable in isolation. `now` is injected (defaults to
// Date.now()) so tests can drive expiry deterministically.

import { randomBytes } from "crypto";

export interface PhotoRef {
  fileId: string;
  fileUniqueId: string;
}

export interface ResolvedOrder {
  id: string;
  orderNumber: string;
  status: string;
}

export interface PhotoSession {
  token: string;
  fromId: string;
  chatId: string;
  photos: PhotoRef[];
  /** null until the order number is known (caption or typed reply). */
  order: ResolvedOrder | null;
  /** true once the kind buttons have been sent, so an album doesn't re-prompt. */
  buttonsSent: boolean;
  createdAt: number;
}

const TTL_MS = 15 * 60 * 1000; // 15 minutes

const byToken = new Map<string, PhotoSession>();
const tokenByFrom = new Map<string, string>();

function newToken(): string {
  return randomBytes(8).toString("hex"); // 16 hex chars, ':'-free
}

function isExpired(s: PhotoSession, now: number): boolean {
  return now - s.createdAt > TTL_MS;
}

function dropExpired(now: number): void {
  for (const [token, s] of byToken) {
    if (isExpired(s, now)) {
      byToken.delete(token);
      if (tokenByFrom.get(s.fromId) === token) tokenByFrom.delete(s.fromId);
    }
  }
}

/** Look up a sender's current (unexpired) session, or null. */
export function getSessionByFrom(fromId: string, now: number = Date.now()): PhotoSession | null {
  const token = tokenByFrom.get(fromId);
  if (!token) return null;
  const s = byToken.get(token);
  if (!s) {
    tokenByFrom.delete(fromId);
    return null;
  }
  if (isExpired(s, now)) {
    byToken.delete(token);
    tokenByFrom.delete(fromId);
    return null;
  }
  return s;
}

/** Fast in-memory guard — does this sender have a pending photo session? Used to
 *  decide whether a plain text DM should be treated as an order-number reply. */
export function hasPendingSession(fromId: string, now: number = Date.now()): boolean {
  return getSessionByFrom(fromId, now) !== null;
}

/**
 * Stash one photo for a sender. Accumulates into the sender's existing session
 * (album / multi-send) or starts a new one. If `order` is given and the session
 * has none yet, it is attached. Returns the session and whether it was just
 * created (the caller prompts only on a new session, so an album doesn't trigger
 * N prompts).
 */
export function stashPhoto(
  fromId: string,
  chatId: string,
  photo: PhotoRef,
  order: ResolvedOrder | null,
  now: number = Date.now(),
): { session: PhotoSession; isNew: boolean } {
  dropExpired(now);
  const existing = getSessionByFrom(fromId, now);
  if (existing) {
    existing.photos.push(photo);
    if (order && !existing.order) existing.order = order;
    return { session: existing, isNew: false };
  }
  const token = newToken();
  const session: PhotoSession = {
    token,
    fromId,
    chatId,
    photos: [photo],
    order: order ?? null,
    buttonsSent: false,
    createdAt: now,
  };
  byToken.set(token, session);
  tokenByFrom.set(fromId, token);
  return { session, isNew: true };
}

/** Attach a resolved order to a sender's pending session (the typed-reply path).
 *  Returns the updated session, or null if the sender has no pending session. */
export function setSessionOrder(
  fromId: string,
  order: ResolvedOrder,
  now: number = Date.now(),
): PhotoSession | null {
  const s = getSessionByFrom(fromId, now);
  if (!s) return null;
  s.order = order;
  return s;
}

/** Remove and return a session by its token (on a button tap). Null if it is
 *  gone (expired, or already taken by a previous tap). */
export function takeSessionByToken(token: string, now: number = Date.now()): PhotoSession | null {
  const s = byToken.get(token);
  if (!s) return null;
  byToken.delete(token);
  if (tokenByFrom.get(s.fromId) === token) tokenByFrom.delete(s.fromId);
  if (isExpired(s, now)) return null;
  return s;
}

/** Drop a sender's session (e.g. authorization lost). */
export function clearSession(fromId: string): void {
  const token = tokenByFrom.get(fromId);
  if (token) byToken.delete(token);
  tokenByFrom.delete(fromId);
}

/** Test-only: wipe all sessions between tests. */
export function __resetSessionsForTest(): void {
  byToken.clear();
  tokenByFrom.clear();
}
