export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { PaymentRejectSchema } from "@/lib/validation";
import { ok, fail, handler } from "@/lib/api";
import { getCurrentUser, canConfirmCash } from "@/lib/auth";

/**
 * POST /api/payments/[id]/reject   (ADMIN | OWNER only)
 *
 * Marks the payment REJECTED with a reason. Does NOT change
 * order.confirmedPaid (rejected payments don't count). The operator
 * can record a fresh Payment row after fixing whatever was wrong.
 */
export const POST = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const user = await getCurrentUser();
  if (!canConfirmCash(user)) {
    return fail("Only ADMIN or OWNER can reject payments", 403);
  }
  const actor = await prisma.user.findUnique({
    where: { id: user!.sub },
    select: { id: true },
  });
  if (!actor) {
    return fail("Your session is stale — please log out and log back in.", 401);
  }

  const body = PaymentRejectSchema.parse(await req.json());

  const payment = await prisma.payment.findUnique({ where: { id: ctx.params.id } });
  if (!payment) return fail("Payment not found", 404);
  if (payment.status !== "PENDING_CONFIRMATION") {
    return fail(`Payment is already ${payment.status}`, 422);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "REJECTED",
        rejectedById: actor.id,
        rejectedAt: new Date(),
        rejectionReason: body.reason.trim(),
      },
    });
    await tx.orderEvent.create({
      data: {
        orderId: payment.orderId,
        type: "PAYMENT_REJECTED",
        actorId: actor.id,
        message: `Payment ${payment.id.slice(-6)} rejected: ${body.reason}`,
        payload: { paymentId: payment.id, reason: body.reason },
      },
    });
    return p;
  });

  return ok(updated);
});
