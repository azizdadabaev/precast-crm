export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { loadPricingConfig } from "@/lib/pricing-config";
import { computeOrderTotals } from "@/lib/order-totals";
import { CalculateBatchSchema } from "./schema";

/**
 * POST /api/calculate/batch — calculator.use
 *
 * Server-side quote for a whole project: every room through the engine
 * at live pricing plus the discount/delivery roll-up, exactly as
 * /api/orders would price it. Persists nothing. The Android app ports
 * the engine and uses this route as its parity oracle (spec S9 / §6.4).
 */
export const POST = withPermission("calculator.use", async (req: NextRequest) => {
  const body = CalculateBatchSchema.parse(await req.json());
  const pricing = await loadPricingConfig();
  const totals = computeOrderTotals(
    body.rooms,
    {
      discountPercent: body.discountPercent,
      discountAmount: body.discountAmount,
      deliveryCost: body.deliveryCost,
      otherCost: body.otherCost,
    },
    pricing,
  );
  return ok({
    rooms: totals.computed.map((c) => c.result),
    roomsSubtotal: totals.roomsSubtotal,
    totalArea: totals.totalArea,
    totalBlocks: totals.totalBlocks,
    totalBeams: totals.totalBeams,
    discountAmount: totals.discountAmount,
    resolvedDiscountPercent: totals.resolvedDiscountPercent,
    discountMode: totals.discountMode,
    totalPrice: totals.totalPrice,
  });
});
