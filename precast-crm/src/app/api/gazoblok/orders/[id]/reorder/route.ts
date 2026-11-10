export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { GAZOBLOK_PERMISSION } from "@/lib/gazoblok-permissions";
import { reorderDraft } from "@/lib/gazoblok-reorder";

/**
 * GET /api/gazoblok/orders/[id]/reorder — read-only draft for «Қайта буюртма» (spec §3).
 * Ordered quantities at today's catalog prices; archived or deleted sizes come back in
 * `dropped`. Delivery, discount and date are hints only — nothing is placed here.
 */
export const GET = withPermission<{ id: string }>(GAZOBLOK_PERMISSION.placeOrder, async (_req: NextRequest, { params }) => {
  const order = await prisma.gazoblokOrder.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      lines: true,
      shipments: { select: { loadedLines: true } },
    },
  });
  if (!order) return fail("Буюртма топилмади · Order not found", 404);

  const catalog = await prisma.gazoblokProduct.findMany({
    select: { id: true, label: true, pricePerBlock: true, active: true },
  });

  return ok(
    reorderDraft(
      {
        ...order,
        deliveryCost: Number(order.deliveryCost),
        discountPercent: Number(order.discountPercent),
        lines: order.lines.map((l) => ({ ...l, unitPrice: Number(l.unitPrice) })),
      },
      catalog.map((p) => ({ ...p, pricePerBlock: Number(p.pricePerBlock) })),
    ),
  );
});
