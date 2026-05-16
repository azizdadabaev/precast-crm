export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { DispatchCreateSchema } from "@/lib/validation";
import { fail, created } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";

/**
 * POST /api/orders/[id]/dispatch — dispatch.create
 *
 * Atomically creates a Dispatch + flips order.status to DISPATCHED.
 * The order must be IN_PRODUCTION; we don't allow dispatching from
 * PLACED (production must have started — even if instantaneously) so
 * the audit trail is consistent.
 *
 * v1: one Dispatch per Order (orderId is @unique on Dispatch). If a
 * delivery is rejected and the truck returns, an admin moves the order
 * manually back to IN_PRODUCTION before a new dispatch can be created.
 */
export const POST = withPermission<{ id: string }>(
  "dispatch.create",
  async (req: NextRequest, { user, params }) => {
    const body = DispatchCreateSchema.parse(await req.json());

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: { dispatch: true },
    });
    if (!order) return fail("Order not found", 404);
    if (order.status !== "IN_PRODUCTION" && order.status !== "LOADED") {
      return fail(
        `Dispatch is only allowed from IN_PRODUCTION or LOADED (current: ${order.status})`,
        422,
      );
    }
    if (order.dispatch) {
      return fail("This order already has a dispatch", 409);
    }

    const driver = body.driverId
      ? await prisma.driver.findUnique({ where: { id: body.driverId } })
      : null;
    if (body.driverId && (!driver || !driver.active)) {
      return fail("Driver not found or inactive", 422);
    }

    const result = await prisma.$transaction(async (tx) => {
      const dispatch = await tx.dispatch.create({
        data: {
          orderId: order.id,
          driverId: body.driverId ?? null,
          truckIdentifier: body.truckIdentifier ?? null,
          expectedCollection: body.expectedCollection,
          notes: body.notes ?? null,
          dispatchedById: user.id,
          dispatchedAt: new Date(),
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: { status: "DISPATCHED" },
      });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: "ORDER_DISPATCHED",
          actorId: user.id,
          message: driver
            ? `Dispatched: driver ${driver.name}, expected collection ${body.expectedCollection}`
            : `Dispatched: client's own transport, expected collection ${body.expectedCollection}`,
          payload: {
            dispatchId: dispatch.id,
            driverId: driver?.id ?? null,
            driverName: driver?.name ?? null,
            truckIdentifier: body.truckIdentifier ?? null,
            expectedCollection: body.expectedCollection,
          },
        },
      });
      return dispatch;
    });

    recordAudit({
      userId: user.id,
      action: "dispatch.create",
      targetType: "order",
      targetId: order.id,
      message: driver
        ? `Dispatched ${order.orderNumber} with driver ${driver.name}`
        : `Dispatched ${order.orderNumber} with client's own transport`,
      metadata: {
        orderNumber: order.orderNumber,
        driverId: driver?.id ?? null,
        driverName: driver?.name ?? null,
        truckIdentifier: body.truckIdentifier ?? null,
      },
    });

    return created(result);
  },
);
