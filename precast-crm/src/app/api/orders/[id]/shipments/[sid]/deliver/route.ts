export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * POST /api/orders/[id]/shipments/[sid]/deliver
 *
 * Marks one shipment as DELIVERED.
 * The overall Order is not touched here — the operator uses the
 * order-level "Етказилган" button (PATCH /api/orders/[id] status=DELIVERED)
 * once ALL shipments are dispatched/delivered and balance = 0.
 */
export const POST = withPermission<{ id: string; sid: string }>(
  "dispatch.create",
  async (_req: NextRequest, { user, params }) => {
    const shipment = await prisma.shipment.findFirst({
      where: { id: params.sid, orderId: params.id },
    });
    if (!shipment) return fail("Shipment not found", 404);
    if (shipment.status !== "DISPATCHED") {
      return fail(`Shipment must be DISPATCHED before delivery (current: ${shipment.status})`, 422);
    }

    await prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: params.sid },
        data: { status: "DELIVERED", deliveredAt: new Date() },
      });
      await tx.orderEvent.create({
        data: {
          orderId: params.id,
          type: "SHIPMENT_DELIVERED",
          actorId: user.id,
          message: `Жўнатма ${shipment.number} етказилди`,
          payload: { shipmentId: params.sid, number: shipment.number },
        },
      });
    });

    return ok({ delivered: true });
  },
);
