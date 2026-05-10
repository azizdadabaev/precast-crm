export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * POST /api/payments/[id]/handover — payment.record
 *
 * Records the physical hand-over of cash from driver to office. Stamps
 * `handedOverToOfficeBy/At` on the Payment AND `returnedAt` on the
 * linked Dispatch (if not already set). The payment STAYS
 * PENDING_CONFIRMATION — this step records custody, not approval.
 *
 * Permission: payment.record — same operators who record cash also
 * mark its arrival at the office. The actual approval (was the amount
 * correct?) is the owner's job via /confirm (payment.confirm).
 */
export const POST = withPermission<{ id: string }>(
  "payment.record",
  async (_req: NextRequest, { user, params }) => {
    const payment = await prisma.payment.findUnique({
      where: { id: params.id },
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
          handedOverToOfficeById: user.id,
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
          actorId: user.id,
          message: `Cash handed over to office (payment ${payment.id.slice(-6)})`,
          payload: { paymentId: payment.id, amount: Number(payment.amount) },
        },
      });
      return p;
    });

    return ok(updated);
  },
);
