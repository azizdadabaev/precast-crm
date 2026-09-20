export const dynamic = "force-dynamic";

import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { HANDOFF_ACTION } from "@/lib/handoff-caller";
import {
  HANDOFF_PRESET_KEYS,
  isPresetConfigured,
  loadHandoffPresets,
} from "@/lib/handoff-presets";

/**
 * `GET /api/handoff/presets` — which of the four presets can actually be
 * delivered right now.
 *
 * The dispatcher skips an unconfigured preset silently and that is the right
 * behaviour server-side (sending nothing beats sending a wrong pin). On a phone
 * it is not enough: a toggle the operator can switch on, during a call, that
 * then delivers nothing is worse than no toggle at all — they would believe the
 * customer got a price list. So the app asks first and shows the unconfigured
 * ones as unavailable.
 *
 * Deliberately returns ONLY the key names. The full config — `file_id`s and the
 * factory's coordinates — stays behind `/api/settings/handoff-presets`, which
 * the admin screen uses and which is gated far more tightly.
 *
 * Note on the middleware: `/api/handoff` sits in PUBLIC_PATHS (its POST carries
 * a device token rather than a session) and that entry prefix-matches this path
 * too, so the session gate here is `withPermission` and nothing else. That is
 * the same arrangement the sibling GET relies on.
 */
export const GET = withPermission(HANDOFF_ACTION, async () => {
  const cfg = await loadHandoffPresets();
  return ok({
    configured: HANDOFF_PRESET_KEYS.filter((k) => isPresetConfigured(cfg, k)),
  });
});
