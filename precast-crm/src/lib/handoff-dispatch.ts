// Deliver the media a caller was promised on the phone, once their first
// Telegram message has been matched to the call (see
// docs/superpowers/specs/2026-08-12-call-to-telegram-handoff-design.md §4.5).
//
// Two properties matter more than anything else here:
//
//  1. It NEVER throws. The only caller is the Telegram webhook; a media failure
//     must not turn into a 500, because Telegram would then retry the same
//     update for 24h.
//  2. One bad preset does not sink the others. Each preset is dispatched and
//     accounted for independently, so a missing price-list file_id still lets
//     the location and the photos through.
//
// Nothing is invented: a preset the owner has not configured yet is SKIPPED, not
// guessed. Sending a wrong map pin is worse than sending nothing.

import {
  loadHandoffPresets,
  configuredPresets,
  isHandoffPresetKey,
  type HandoffPresetConfig,
  type HandoffPresetKey,
} from "@/lib/handoff-presets";
import {
  sendBusinessLocation,
  sendBusinessProofMedia,
  sendBusinessDocument,
  type SendBusinessReplyResult,
} from "@/lib/inbox-send";

/**
 * Delivery order — the pin first (that is what most callers ask for), then the
 * light proof media, then the heavy video, then the price list. Fixed, so two
 * customers who asked for the same things receive them the same way.
 */
const DISPATCH_ORDER: readonly HandoffPresetKey[] = [
  "LOCATION",
  "PHOTOS",
  "VIDEOS",
  "PRICELIST",
] as const;

export interface HandoffDispatchResult {
  /** Presets fully delivered. */
  sent: string[];
  /** Requested but not configured (or not a known preset) — nothing was sent. */
  skipped: string[];
  /** Attempted and failed, in whole or in part. */
  failed: { preset: string; reason: string }[];
}

function reasonOf(res: SendBusinessReplyResult): string | null {
  return res.ok ? null : res.reason;
}

/** Runs one send, converting any thrown error into a reason string. */
async function attempt(run: () => Promise<SendBusinessReplyResult>): Promise<string | null> {
  try {
    return reasonOf(await run());
  } catch (err) {
    console.error("[handoff dispatch send]", err);
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * Send every configured preset of `presets` into `conversationId`.
 *
 * `userId` is the operator credited on the outbound rows — null for the webhook,
 * which sends on the system's behalf.
 */
export async function dispatchHandoffPresets(input: {
  conversationId: string;
  presets: readonly string[];
  userId: string | null;
}): Promise<HandoffDispatchResult> {
  const requested = Array.from(new Set(input.presets));
  const sent: string[] = [];
  const failed: { preset: string; reason: string }[] = [];

  let cfg: HandoffPresetConfig;
  try {
    cfg = await loadHandoffPresets();
  } catch (err) {
    // No config → nothing can be delivered. Report it as a failure (not a skip)
    // so the owner can tell "not set up yet" apart from "the DB was down".
    console.error("[handoff dispatch] preset config unavailable", err);
    return {
      sent: [],
      skipped: [],
      failed: requested.map((preset) => ({ preset, reason: "CONFIG_UNAVAILABLE" })),
    };
  }

  const deliverable = configuredPresets(cfg, requested);
  const skipped = requested.filter(
    (p) => !(isHandoffPresetKey(p) && deliverable.includes(p)),
  );

  for (const key of DISPATCH_ORDER) {
    if (!deliverable.includes(key)) continue;

    // configuredPresets() already proved the payload for `key` is present, so
    // the non-null assertions below are backed by that check, not by hope.
    const reasons: string[] = [];
    if (key === "LOCATION") {
      const loc = cfg.LOCATION!;
      const reason = await attempt(() =>
        sendBusinessLocation({
          conversationId: input.conversationId,
          latitude: loc.lat,
          longitude: loc.lng,
          userId: input.userId,
        }),
      );
      if (reason) reasons.push(reason);
    } else if (key === "PHOTOS" || key === "VIDEOS") {
      const media = key === "PHOTOS" ? cfg.PHOTOS! : cfg.VIDEOS!;
      for (const [i, fileId] of media.fileIds.entries()) {
        // Caption once, on the first item — otherwise a five-photo set repeats
        // the same sentence five times in the customer's chat.
        const reason = await attempt(() =>
          sendBusinessProofMedia({
            conversationId: input.conversationId,
            kind: key === "PHOTOS" ? "PHOTO" : "VIDEO",
            fileId,
            caption: i === 0 ? media.caption ?? null : null,
            userId: input.userId,
          }),
        );
        if (reason) reasons.push(reason);
      }
    } else {
      const doc = cfg.PRICELIST!;
      const reason = await attempt(() =>
        sendBusinessDocument({
          conversationId: input.conversationId,
          fileId: doc.fileId,
          caption: doc.caption ?? null,
          userId: input.userId,
        }),
      );
      if (reason) reasons.push(reason);
    }

    // A preset counts as sent only when every one of its items went out; a
    // partial set is reported as failed so the owner knows to follow up.
    if (reasons.length === 0) sent.push(key);
    else failed.push({ preset: key, reason: reasons.join(", ") });
  }

  return { sent, skipped, failed };
}
