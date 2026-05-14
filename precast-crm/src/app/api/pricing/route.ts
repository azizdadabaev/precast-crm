export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { withAuth, withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import {
  loadPricingConfig,
  loadPricingMeta,
  savePricingConfig,
} from "@/lib/pricing-config";
import {
  M2_PRICE_TIERS,
  EXTRA_BEAM_PRICE_TIERS,
} from "@/services/calculation-engine";

/**
 * GET /api/pricing — any authenticated user. The live calculator
 * (every operator) needs this to compute previews against the
 * current price tiers, so it's open to all roles. Editing is
 * restricted via PUT below.
 */
export const GET = withAuth(async () => {
  const [config, meta] = await Promise.all([
    loadPricingConfig(),
    loadPricingMeta(),
  ]);
  return ok({
    m2PriceTiers: config.m2_price_tiers,
    extraBeamPriceTiers: config.extra_beam_price_tiers,
    blockUnitPrice: config.block_unit_price,
    updatedAt: meta.updatedAt,
  });
});

/**
 * PUT /api/pricing — owner-only. Replaces the current pricing in one
 * atomic write. Bracket boundaries (max_beam_length) are fixed; only
 * the prices inside each bracket are accepted. Records an audit row
 * with old + new prices so the change is recoverable from the journal.
 */
const TierPriceArray = z
  .array(z.number().finite().nonnegative())
  .length(M2_PRICE_TIERS.length); // both m² and extra-beam tiers happen to have 5 brackets

const PutBody = z.object({
  m2: TierPriceArray,
  extraBeam: TierPriceArray,
  block: z.number().finite().nonnegative(),
});

export const PUT = withPermission(
  "pricing.edit",
  async (req: NextRequest, { user }) => {
    const body = PutBody.parse(await req.json());

    if (body.extraBeam.length !== EXTRA_BEAM_PRICE_TIERS.length) {
      return fail(
        `Expected ${EXTRA_BEAM_PRICE_TIERS.length} extra-beam tiers, got ${body.extraBeam.length}`,
        422,
      );
    }

    const previous = await loadPricingConfig();

    const next = await savePricingConfig({
      m2_price_tiers: M2_PRICE_TIERS.map((t, i) => ({
        max_beam_length: t.max_beam_length,
        price: body.m2[i],
      })),
      extra_beam_price_tiers: EXTRA_BEAM_PRICE_TIERS.map((t, i) => ({
        max_beam_length: t.max_beam_length,
        price: body.extraBeam[i],
      })),
      block_unit_price: body.block,
    });

    recordAudit({
      userId: user.id,
      action: "pricing.update",
      targetType: "app_config",
      targetId: "pricing.tiers",
      message: "Updated pricing tiers",
      metadata: {
        previous: {
          m2: previous.m2_price_tiers.map((t) => t.price),
          extraBeam: previous.extra_beam_price_tiers.map((t) => t.price),
          block: previous.block_unit_price,
        },
        next: {
          m2: next.m2_price_tiers.map((t) => t.price),
          extraBeam: next.extra_beam_price_tiers.map((t) => t.price),
          block: next.block_unit_price,
        },
      },
    });

    return ok({
      m2PriceTiers: next.m2_price_tiers,
      extraBeamPriceTiers: next.extra_beam_price_tiers,
      blockUnitPrice: next.block_unit_price,
    });
  },
);
