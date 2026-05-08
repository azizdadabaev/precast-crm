export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { DispatchCreateSchema } from "@/lib/validation";
import { ok, fail, created, handler } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

/**
 * POST /api/orders/[id]/dispatch   (any authenticated role)
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
export const POST = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const user = await getCurrentUser();
  if (!user) return fail("Unauthorized", 401);
  const actor = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { id: true },
  });
  if (!actor) {
    return fail("Your session is stale — please log out and log back in.", 401);
  }

  const body = DispatchCreateSchema.parse(await req.json());

  const order = await prisma.order.findUnique({
    where: { id: ctx.params.id },
    include: { dispatch: true },
  });
  if (!order) return fail("Order not found", 404);
  if (order.status !== "IN_PRODUCTION") {
    return fail(
      `Dispatch is only allowed from IN_PRODUCTION (current: ${order.status})`,
      422,
    );
  }
  if (order.dispatch) {
    return fail("This order already has a dispatch", 409);
  }

  const driver = await prisma.driver.findUnique({ where: { id: body.driverId } });
  if (!driver || !driver.active) {
    return fail("Driver not found or inactive", 422);
  }

  const result = await prisma.$transaction(async (tx) => {
    const dispatch = await tx.dispatch.create({
      data: {
        orderId: order.id,
        driverId: body.driverId,
        truckIdentifier: body.truckIdentifier ?? null,
        expectedCollection: body.expectedCollection,
        notes: body.notes ?? null,
        dispatchedById: actor.id,
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
        actorId: actor.id,
        message: `Dispatched: driver ${driver.name}, expected collection ${body.expectedCollection}`,
        payload: {
          dispatchId: dispatch.id,
          driverId: driver.id,
          driverName: driver.name,
          truckIdentifier: body.truckIdentifier ?? null,
          expectedCollection: body.expectedCollection,
        },
      },
    });
    return dispatch;
  });

  return created(result);
});
