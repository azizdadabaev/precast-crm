export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, created } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * POST /api/orders/[id]/shipments
 *
 * Creates the next Shipment for this order (auto-numbered).
 * The order must be IN_PRODUCTION or DISPATCHED (subsequent trucks
 * can be created after the first one has already left).
 */
export const POST = withPermission<{ id: string }>(
  "dispatch.create",
  async (_req: NextRequest, { user, params }) => {
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: { shipments: true },
    });
    if (!order) return fail("Order not found", 404);
    if (!["PLACED", "IN_PRODUCTION", "DISPATCHED"].includes(order.status)) {
      return fail(
        `Split shipments can only be created from PLACED, IN_PRODUCTION or DISPATCHED (current: ${order.status})`,
        422,
      );
    }

    const nextNumber = (order.shipments.length > 0
      ? Math.max(...order.shipments.map((s) => s.number))
      : 0) + 1;

    const shipment = await prisma.$transaction(async (tx) => {
      const s = await tx.shipment.create({
        data: {
          orderId: params.id,
          number: nextNumber,
          status: "PENDING",
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: params.id,
          type: "SHIPMENT_CREATED",
          actorId: user.id,
          message: `Жўнатма ${nextNumber} яратилди`,
          payload: { shipmentId: s.id, number: nextNumber },
        },
      });
      return s;
    });

    return created(shipment);
  },
);
