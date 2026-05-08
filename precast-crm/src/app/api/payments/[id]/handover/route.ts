export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, handler } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

/**
 * POST /api/payments/[id]/handover
 *
 * Records the physical hand-over of cash from driver to office. Stamps
 * `handedOverToOfficeBy/At` on the Payment AND `returnedAt` on the
 * linked Dispatch (if not already set). The payment STAYS
 * PENDING_CONFIRMATION — this step records custody, not approval.
 *
 * Any authenticated role may perform this. The actual approval (was
 * the amount correct?) is the owner's job via /confirm.
 */
export const POST = handler(async (_req: NextRequest, ctx: { params: { id: string } }) => {
  const user = await getCurrentUser();
  if (!user) return fail("Unauthorized", 401);
  const actor = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { id: true },
  });
  if (!actor) {
    return fail("Your session is stale — please log out and log back in.", 401);
  }

  const payment = await prisma.payment.findUnique({
    where: { id: ctx.params.id },
    include: { order: { include: { dispatch: true } } },
  });
  if (!payment) return fail("Payment not found", 404);
  if (payment.status !== "PENDING_CONFIRMATION") {
    return fail("Hand-over can only be recorded on a pending payment", 422);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.update({
      where: { id: payment.id },
      data: {
        handedOverToOfficeById: actor.id,
        handedOverToOfficeAt: new Date(),
      },
    });
    if (payment.order.dispatch && !payment.order.dispatch.returnedAt) {
      await tx.dispatch.update({
        where: { id: payment.order.dispatch.id },
        data: { returnedAt: new Date() },
      });
    }
    await tx.orderEvent.create({
      data: {
        orderId: payment.orderId,
        type: "PAYMENT_HANDED_OVER",
        actorId: actor.id,
        message: `Cash handed over to office (payment ${payment.id.slice(-6)})`,
        payload: { paymentId: payment.id, amount: Number(payment.amount) },
      },
    });
    return p;
  });

  return ok(updated);
});
