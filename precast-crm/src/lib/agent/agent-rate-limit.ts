// Outbound-message throttle for the LIVE conversational agent (Meta account-
// integrity guard). Meta restricted the business for "a large amount of activity
// quickly created by a machine" — yet the agent send path had NO message-rate
// limit (the existing RateLimiter was wired only into the calculator endpoint).
// This is that throttle: checked before every AUTO send, keyed per conversation.
//
// We reuse RateLimiter for MESSAGE gating only — token budgets are set wide open
// here (the agent loop doesn't gate tokens at this layer), so only the per-minute
// / per-hour / per-day message windows and the global daily ceiling can fire.
// Caps are OUR conservative policy (a real sales chat is small), chosen to stay
// far inside Meta's qualitative "very high frequency" bar — they are not a
// Meta-published number. In-memory (resets on redeploy); persisting them is the
// P1 follow-up. On deny the caller hands the chat to a human, never drops it.

import { RateLimiter } from './rate-limiter';

const WIDE = Number.MAX_SAFE_INTEGER; // token gates disabled at this layer

export const agentSendLimiter = new RateLimiter({
  perMinute: 6, // per conversation — burst-coalescing already collapses rapid input
  perHour: 60,
  perUserDailyMessages: 40, // per conversation/day — a genuine sales chat is small
  globalDailyMessages: 1000, // org-wide outbound ceiling (circuit-breaker)
  userDailyTokens: WIDE,
  globalDailyTokens: WIDE,
});
