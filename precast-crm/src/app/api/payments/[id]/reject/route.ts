export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { PaymentRejectSchema } from "@/lib/validation";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { emitNotifications } from "@/lib/notifications";

/**
 * POST /api/payments/[id]/reject — payment.confirm
 *
 * Marks the payment REJECTED with a reason. Does NOT change
 * order.confirmedPaid (rejected payments don't count). The operator
 * can record a fresh Payment row after fixing whatever was wrong.
 *
 * Permission: payment.confirm — same gate as the confirm action,
 * since rejection is the other side of the same authority.
 */
export const POST = withPermission<{ id: string }>(
  "payment.confirm",
  async (req: NextRequest, { user, params }) => {
    const body = PaymentRejectSchema.parse(await req.json());

    const payment = await prisma.payment.findUnique({
      where: { id: params.id },
    });
    if (!payment) return fail("Payment not found", 404);
    if (payment.status !== "PENDING_CONFIRMATION") {
      return fail(`Payment is already ${payment.status}`, 422);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "REJECTED",
          rejectedById: user.id,
          rejectedAt: new Date(),
          rejectionReason: body.reason.trim(),
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: payment.orderId,
          type: "PAYMENT_REJECTED",
          actorId: user.id,
          message: `Payment ${payment.id.slice(-6)} rejected: ${body.reason}`,
          payload: { paymentId: payment.id, reason: body.reason },
        },
      });
      return p;
    });

    void emitNotifications({
      type: "PAYMENT_REJECTED",
      userIds: [payment.recordedById],
      title: `Тўлов рад этилди · Payment rejected: ${Math.round(Number(payment.amount)).toLocaleString("ru-RU")} UZS`,
      body: body.reason.trim(),
      paymentId: payment.id,
      orderId: payment.orderId,
    });

    return ok(updated);
  },
);
