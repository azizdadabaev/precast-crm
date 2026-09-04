export const dynamic = "force-dynamic";

import { ok } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import { loadPricingConfig, loadPricingMeta } from "@/lib/pricing-config";
import { CAPACITY_THRESHOLDS } from "@/lib/capacity";
import { VILOYATS, TUMANS } from "@/lib/regions";

/**
 * GET /api/mobile/bootstrap — any active user.
 *
 * One cold-start round trip for the Android app (spec S7): the session
 * (same shape as /api/auth/me), live pricing (same shape as /api/pricing),
 * the capacity tiers, a regions catalogue version so the app knows when
 * to refresh its bundled copy, and the minimum app version the server
 * still supports (force-upgrade lever, env MOBILE_MIN_APP_VERSION).
 */
export const GET = withAuth(async (_req, { user }) => {
  const [config, meta] = await Promise.all([loadPricingConfig(), loadPricingMeta()]);
  return ok({
    me: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: user.permissions,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
    },
    pricing: {
      m2PriceTiers: config.m2_price_tiers,
      extraBeamPriceTiers: config.extra_beam_price_tiers,
      blockUnitPrice: config.block_unit_price,
      updatedAt: meta.updatedAt,
    },
    capacityThresholds: CAPACITY_THRESHOLDS,
    regionsVersion: `${VILOYATS.length}-${TUMANS.length}`,
    minSupportedAppVersion: process.env.MOBILE_MIN_APP_VERSION ?? "0",
    serverTime: new Date().toISOString(),
  });
});
