// Post-LLM outbound validator (spec §6.5). Runs synchronously before any reply
// is sent; a block verdict means the caller replaces the message with a safe
// escalation. Two unambiguous hard rules:
//   1. A price (digits + a UZS currency word) may appear ONLY when a fresh
//      get_quote quote_id was minted this turn (price-integrity, §6.1).
//   2. The bot NEVER sends links (§7).

export interface OutboundContext {
  /** A fresh quote_id was minted on THIS turn, so a price is allowed to appear. */
  hasFreshQuote: boolean;
}

export type OutboundVerdict = { ok: true } | { ok: false; reason: string };

// A price = a digit run (optionally grouped by spaces/dots/commas) followed by a
// UZS currency word. The `so.?m` arm matches som / so'm / soʻm (any apostrophe
// variant). Requiring the currency word keeps phone numbers, room counts, and
// beam sizes ("4.30 m") from matching.
const PRICE_RE = /\d[\d\s.,]*\s*(so[''ʻ]?m|sum|сум|сўм)/iu;

// Any link: an explicit URL, a t.me handle, or a bare domain with a known TLD.
// TLDs are business-context (UZ/RU market); a false positive is safe (escalates
// to a human) and is unlikely since the LLM rarely emits bare-domain strings.
const URL_RE =
  /(https?:\/\/\S+|\bwww\.\S+|\bt\.me\/\S+|\b[a-z0-9-]+\.(uz|com|net|org|ru|io|me)\b)/i;

export function validateOutbound(message: string, ctx: OutboundContext): OutboundVerdict {
  if (URL_RE.test(message)) {
    return { ok: false, reason: 'outgoing message contains a link (the bot never sends links)' };
  }
  if (PRICE_RE.test(message) && !ctx.hasFreshQuote) {
    return { ok: false, reason: 'price present without a fresh quote_id this turn' };
  }
  return { ok: true };
}
