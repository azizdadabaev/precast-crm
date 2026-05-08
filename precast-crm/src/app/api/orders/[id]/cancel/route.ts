export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { CancelOrderSchema } from "@/lib/validation";
import { ok, fail, handler } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import {
  calcSnapshotToInventoryLines,
  restockForCancellation,
} from "@/lib/inventory";

const CANCEL_PASSWORD = process.env.ORDER_CANCEL_PASSWORD ?? "etalontbm";

/**
 * POST /api/orders/[id]/cancel
 *
 * Allowed when EITHER:
 *   - the caller is ADMIN, OR
 *   - the caller supplies the correct cancel password
 *
 * Effect: order.status = CANCELED, project goes back to DRAFT, deal moves to LOST.
 */
export const POST = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const body = CancelOrderSchema.parse(await req.json());

  const user = await getCurrentUser();
  const isAdmin = user?.role === "ADMIN";
  const passwordOk = body.password && body.password === CANCEL_PASSWORD;

  if (!isAdmin && !passwordOk) {
    return fail("Cancellation requires ADMIN role or the cancel password.", 403);
  }

  // The JWT's `sub` may outlive the User row (e.g. after a schema reset
  // that re-seeded users with new IDs). Verify the actor exists before
  // using their id as a foreign key — otherwise the OrderEvent insert
  // throws P2003 and the whole cancellation fails.
  const actorId = user?.sub
    ? (
        await prisma.user.findUnique({
          where: { id: user.sub },
          select: { id: true },
        })
      )?.id ?? null
    : null;

  const existing = await prisma.order.findUnique({
    where: { id: ctx.params.id },
    include: { project: { select: { id: true, dealId: true } } },
  });
  if (!existing) return fail("Order not found", 404);
  if (existing.status === "CANCELED") return fail("Order is already canceled", 422);

  // If the order was ever DELIVERED, the delivery transition decremented
  // inventory; cancellation must mirror it back. We use deliveredAt as
  // the check since PAID is no longer a status (payment lives on
  // OrderPaymentState now). Cancelling a PLACED / IN_PRODUCTION /
  // DISPATCHED order needs no restock — nothing left the warehouse.
  const wasDelivered = existing.deliveredAt != null;
  let restockLines: ReturnType<typeof calcSnapshotToInventoryLines> = [];
  if (wasDelivered) {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: existing.projectId },
      include: { calculations: true },
    });
    restockLines = calcSnapshotToInventoryLines(project.calculations);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.order.update({
      where: { id: existing.id },
      data: {
        status: "CANCELED",
        canceledAt: new Date(),
        cancelReason: body.reason ?? null,
      },
    });
    // Free the project back to DRAFT so it can be edited / re-ordered
    await tx.project.update({
      where: { id: existing.projectId },
      data: { status: "DRAFT" },
    });
    // Move deal to LOST
    if (existing.project?.dealId) {
      await tx.deal
        .update({ where: { id: existing.project.dealId }, data: { stage: "LOST", status: "LOST" } })
        .catch(() => null);
    }
    await tx.orderEvent.create({
      data: {
        orderId: existing.id,
        type: "ORDER_CANCELED",
        actorId, // already resolved + verified above
        message: body.reason ?? null,
        payload: {
          method: isAdmin ? "admin" : "password",
          reason: body.reason ?? "",
          restocked: wasDelivered,
        },
      },
    });
    if (wasDelivered) {
      await restockForCancellation(
        tx,
        existing.id,
        restockLines,
        actorId,
        body.reason ?? null,
      );
    }
    return u;
  });

  return ok(updated);
});
