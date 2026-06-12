// Post-LLM outbound validator (spec §6.5). Runs synchronously before any reply
// is sent; a block verdict means the caller replaces the message with a safe
// escalation. Two unambiguous hard rules:
//   1. A price (digits + a UZS currency word) may appear ONLY when a fresh
//      get_quote quote_id was minted this turn (price-integrity, §6.1).
//   2. The bot NEVER sends links (§7).

import { COMPANY_LOCATION } from './location';

export interface OutboundContext {
  /** A fresh quote_id was minted on THIS turn, so a price is allowed to appear. */
  hasFreshQuote: boolean;
  /** The live published starting rate (lowest m² tier, UZS). This ONE amount may
   *  appear without a quote_id — it's injected into the prompt from the owner's
   *  price list ("140 000 so'mdan boshlanadi"). Any OTHER price still requires a
   *  fresh quote. */
  startingTierPrice?: number;
}

export type OutboundVerdict = { ok: true } | { ok: false; reason: string };

// A price = a digit run (optionally grouped by spaces/dots/commas) followed by a
// UZS currency word. The `so.?m` arm matches som / so'm / soʻm (any apostrophe
// variant). Requiring the currency word keeps phone numbers, room counts, and
// beam sizes ("4.30 m") from matching. `[\d\s.,]*` already absorbs any spacing
// before the currency word, so there is NO separate trailing `\s*` — adding one
// would overlap this class and make the match O(n²) (catastrophic backtracking).
const PRICE_RE = /\d[\d\s.,]*(so[''ʻ]?m|sum|сум|сўм)/iu;

// Any link: an explicit URL, a t.me handle, or a bare domain with a known TLD.
// TLDs are business-context (UZ/RU market); a false positive is safe (escalates
// to a human) and is unlikely since the LLM rarely emits bare-domain strings.
const URL_RE =
  /(https?:\/\/\S+|\bwww\.\S+|\bt\.me\/\S+|\b[a-z0-9-]+\.(uz|com|net|org|ru|io|me)\b)/i;

export function validateOutbound(message: string, ctx: OutboundContext): OutboundVerdict {
  // The company's own Maps location is owner-approved — allow it, but still block
  // any OTHER link. Strip the approved URL before the link check.
  const linkScan = message.split(COMPANY_LOCATION.mapsUrl).join(' ');
  if (URL_RE.test(linkScan)) {
    return { ok: false, reason: 'outgoing message contains a link (the bot never sends links)' };
  }
  if (!ctx.hasFreshQuote) {
    // Without a fresh quote_id, every price-shaped mention must be EXACTLY the
    // published starting rate (compared digit-for-digit), else block. With a
    // fresh quote, prices are allowed as before.
    const allowedDigits =
      ctx.startingTierPrice != null ? String(Math.round(ctx.startingTierPrice)) : null;
    for (const m of message.matchAll(new RegExp(PRICE_RE.source, 'giu'))) {
      const digits = m[0].replace(/\D/g, '');
      if (allowedDigits === null || digits !== allowedDigits) {
        return { ok: false, reason: 'price present without a fresh quote_id this turn' };
      }
    }
  }
  return { ok: true };
}
