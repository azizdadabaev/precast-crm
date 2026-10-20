export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { RefundSchema } from "@/lib/validation";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { refundDue, refundProblem } from "@/lib/overpayment";

/**
 * POST /api/orders/[id]/refund — payment.confirm
 *
 * Records money given back to a client who paid more than the order now
 * costs, or paid for an order that was canceled (owner 2026-10-20). Stored as
 * a CONFIRMED Payment with a NEGATIVE amount: confirmedPaid, revenue by day and
 * the ledger all net it out on the day the money went back, untouched. Written
 * by a confirmer, so there is no second approval step.
 */
export const POST = withPermission<{ id: string }>(
  "payment.confirm",
  async (req: NextRequest, { user, params }) => {
    const body = RefundSchema.parse(await req.json());

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      select: {
        id: true, orderNumber: true, status: true, paidAt: true,
        totalPrice: true, confirmedPaid: true, writeOffAmount: true,
      },
    });
    if (!order) return fail("Буюртма топилмади · Order not found", 404);

    const problem = refundProblem(refundDue(order), body.amount);
    if (problem) return fail(problem, 422);

    const now = new Date();
    const paidOn = body.paidOn ?? now;
    if (paidOn.getTime() > now.getTime() + 60_000) {
      return fail("Сана келажакда бўлиши мумкин эмас · The date cannot be in the future", 422);
    }

    const payment = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          orderId: order.id,
          amount: -body.amount,
          method: body.method,
          status: "CONFIRMED",
          recordedById: user.id,
          recordedAt: now,
          paidOn,
          confirmedById: user.id,
          confirmedAt: now,
          notes: body.note,
        },
      });

      // Same recompute as payment confirmation — the refund row is in the sum.
      const sumAgg = await tx.payment.aggregate({
        _sum: { amount: true },
        where: { orderId: order.id, status: "CONFIRMED" },
      });
      const confirmedPaid = Number(sumAgg._sum.amount ?? 0);
      const total = Number(order.totalPrice);
      const writeOff = Number(order.writeOffAmount);
      const paymentState =
        confirmedPaid + writeOff >= total && total > 0
          ? "FULLY_PAID"
          : confirmedPaid > 0
            ? "PARTIALLY_PAID"
            : "AWAITING_PAYMENT";
      await tx.order.update({
        where: { id: order.id },
        data: { confirmedPaid, paymentState },
      });

      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: "PAYMENT_REFUNDED",
          actorId: user.id,
          message: `Refunded ${body.amount} to the client: ${body.note}`,
          payload: {
            paymentId: p.id,
            amount: body.amount,
            method: body.method,
            paidOn: paidOn.toISOString(),
            note: body.note,
          },
        },
      });
      return p;
    });

    recordAudit({
      userId: user.id,
      action: "payment.refund",
      targetType: "order",
      targetId: order.id,
      message: `Refunded ${body.amount} on ${order.orderNumber}`,
      metadata: { orderNumber: order.orderNumber, amount: body.amount, method: body.method },
    });

    return ok(payment);
  },
);
