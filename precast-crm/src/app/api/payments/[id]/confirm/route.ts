export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PaymentConfirmSchema } from "@/lib/validation";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * POST /api/payments/[id]/confirm   (ADMIN | OWNER only)
 *
 * Atomically:
 *   1. Set payment.status = CONFIRMED, confirmedBy/At
 *   2. If confirmer adjusted the amount: keep originalAmount + adjustmentNote
 *   3. Recompute order.confirmedPaid = sum of CONFIRMED payments
 *   4. Recompute order.paymentState (AWAITING / PARTIAL / FULLY)
 *   5. If shortfall vs dispatch.expectedCollection AND confirmer chose
 *      a discrepancyAction (TRACK | DISCOUNT | WRITEOFF): create a
 *      Discrepancy row with the appropriate status
 *   6. Append OrderEvent(s)
 */
export const POST = withPermission<{ id: string }>(
  "payment.confirm",
  async (req: NextRequest, { user, params }) => {
  const body = PaymentConfirmSchema.parse(await req.json());

  const payment = await prisma.payment.findUnique({
    where: { id: params.id },
    include: { order: { include: { dispatch: true } } },
  });
  if (!payment) return fail("Payment not found", 404);
  if (payment.status !== "PENDING_CONFIRMATION") {
    return fail(`Payment is already ${payment.status}`, 422);
  }

  const originalAmount = Number(payment.amount);
  const finalAmount = body.amount != null ? body.amount : originalAmount;
  const amountChanged = body.amount != null && body.amount !== originalAmount;
  if (amountChanged && (!body.adjustmentNote || body.adjustmentNote.trim().length < 5)) {
    return fail("adjustmentNote (min 5 chars) is required when changing the amount", 422);
  }

  // Discrepancy detection — driver-collected payments only. The
  // dispatch's expectedCollection is the amount the DRIVER was sent to
  // collect on a particular delivery; comparing it to in-office cash
  // or bank/online transfers (which carry no driver) is meaningless and
  // would force the confirmer to pick a discrepancy action for a
  // payment that isn't actually short of anything sent for collection.
  const fromDriver = payment.collectedById != null;
  const expectedCollection =
    fromDriver && payment.order.dispatch?.expectedCollection
      ? Number(payment.order.dispatch.expectedCollection)
      : null;
  const hasShortfall =
    expectedCollection != null && finalAmount < expectedCollection;
  const shortfall = hasShortfall ? expectedCollection! - finalAmount : 0;

  if (hasShortfall) {
    if (!body.discrepancyAction) {
      return fail(
        `Recorded ${finalAmount} is below expected ${expectedCollection}. Choose discrepancyAction (TRACK | DISCOUNT | WRITEOFF) to confirm, or reject.`,
        422,
      );
    }
    if (!body.discrepancyNote || body.discrepancyNote.trim().length < 5) {
      return fail("discrepancyNote (min 5 chars) is required when discrepancyAction is set", 422);
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    // 1. Update payment
    const p = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "CONFIRMED",
        confirmedById: user.id,
        confirmedAt: new Date(),
        amount: finalAmount,
        ...(amountChanged
          ? {
              originalAmount: originalAmount,
              adjustmentNote: body.adjustmentNote!.trim(),
            }
          : {}),
      },
    });

    if (amountChanged) {
      await tx.orderEvent.create({
        data: {
          orderId: payment.orderId,
          type: "PAYMENT_ADJUSTED",
          actorId: user.id,
          message: `Payment ${payment.id.slice(-6)} adjusted: ${originalAmount} → ${finalAmount}`,
          payload: {
            paymentId: payment.id,
            originalAmount,
            newAmount: finalAmount,
            note: body.adjustmentNote,
          },
        },
      });
    }

    // 2. Recompute confirmedPaid + paymentState
    const sumAgg = await tx.payment.aggregate({
      _sum: { amount: true },
      where: { orderId: payment.orderId, status: "CONFIRMED" },
    });
    const confirmedPaid = Number(sumAgg._sum.amount ?? 0);
    const total = Number(payment.order.totalPrice);
    const paymentState =
      confirmedPaid >= total
        ? "FULLY_PAID"
        : confirmedPaid > 0
          ? "PARTIALLY_PAID"
          : "AWAITING_PAYMENT";
    await tx.order.update({
      where: { id: payment.orderId },
      data: {
        confirmedPaid,
        paymentState,
        ...(paymentState === "FULLY_PAID" && !payment.order.paidAt
          ? { paidAt: new Date() }
          : {}),
      },
    });

    // 3. Discrepancy row, if applicable
    let discrepancyId: string | null = null;
    if (hasShortfall && body.discrepancyAction) {
      const discrepancyStatus =
        body.discrepancyAction === "TRACK"
          ? "OPEN"
          : body.discrepancyAction === "DISCOUNT"
            ? "RESOLVED_DISCOUNT"
            : "RESOLVED_WRITEOFF";
      const isResolved = discrepancyStatus !== "OPEN";

      const d = await tx.discrepancy.create({
        data: {
          orderId: payment.orderId,
          paymentId: payment.id,
          driverId: payment.collectedById ?? null,
          expectedAmount: expectedCollection!,
          receivedAmount: finalAmount,
          shortfall,
          status: discrepancyStatus,
          reportedById: user.id,
          reportedAt: new Date(),
          resolvedById: isResolved ? user.id : null,
          resolvedAt: isResolved ? new Date() : null,
          resolutionNote: body.discrepancyNote!.trim(),
        },
      });
      discrepancyId = d.id;

      await tx.orderEvent.create({
        data: {
          orderId: payment.orderId,
          type: "DISCREPANCY_OPENED",
          actorId: user.id,
          message: `Discrepancy ${discrepancyStatus}: short by ${shortfall} (${body.discrepancyAction})`,
          payload: {
            discrepancyId: d.id,
            paymentId: payment.id,
            expected: expectedCollection,
            received: finalAmount,
            shortfall,
            status: discrepancyStatus,
            note: body.discrepancyNote,
          } as Prisma.InputJsonValue,
        },
      });
    }

    // 4. Confirmation event
    await tx.orderEvent.create({
      data: {
        orderId: payment.orderId,
        type: "PAYMENT_CONFIRMED",
        actorId: user.id,
        message: `Payment ${payment.id.slice(-6)} confirmed: ${finalAmount}`,
        payload: {
          paymentId: payment.id,
          amount: finalAmount,
          discrepancyId,
        } as Prisma.InputJsonValue,
      },
    });

    return p;
  });

  return ok(updated);
});
