export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * DELETE /api/orders/[id]/shipments/[sid]
 *
 * Removes a PENDING shipment. Once a shipment has been loaded, dispatched,
 * or delivered it cannot be deleted.
 */
export const DELETE = withPermission<{ id: string; sid: string }>(
  "dispatch.create",
  async (_req: NextRequest, { user, params }) => {
    const shipment = await prisma.shipment.findUnique({
      where: { id: params.sid },
    });
    if (!shipment || shipment.orderId !== params.id) return fail("Shipment not found", 404);
    if (shipment.status !== "PENDING") {
      return fail(
        `Only PENDING shipments can be deleted (current: ${shipment.status})`,
        422,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.shipment.delete({ where: { id: params.sid } });
      await tx.orderEvent.create({
        data: {
          orderId: params.id,
          type: "SHIPMENT_CREATED",
          actorId: user.id,
          message: `Жўнатма ${shipment.number} ўчирилди`,
          payload: { shipmentId: params.sid, number: shipment.number, deleted: true },
        },
      });
    });

    return ok({ deleted: true });
  },
);
