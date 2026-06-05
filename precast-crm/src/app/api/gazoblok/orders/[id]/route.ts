export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import {
  decrementGazoblokForOrder,
  restockGazoblokForCancellation,
} from "@/lib/gazoblok-stock";
import { GazoblokOrderActionSchema } from "@/lib/gazoblok-validation";

type PaymentState = "AWAITING_PAYMENT" | "PARTIALLY_PAID" | "FULLY_PAID";

function recomputePaymentState(totalPrice: number, confirmedPaid: number): PaymentState {
  if (confirmedPaid <= 0) return "AWAITING_PAYMENT";
  if (confirmedPaid + 1e-6 >= totalPrice) return "FULLY_PAID";
  return "PARTIALLY_PAID";
}

/** GET /api/gazoblok/orders/[id] — gazoblok.view. Full order detail. */
export const GET = withPermission<{ id: string }>(
  "gazoblok.view",
  async (_req: NextRequest, { params }) => {
    const order = await prisma.gazoblokOrder.findUnique({
      where: { id: params.id },
      include: {
        client: true,
        lines: { include: { product: { select: { id: true, label: true } } } },
        payments: { orderBy: { recordedAt: "desc" } },
        events: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!order) return fail("Буюртма топилмади · Order not found", 404);
    return ok(order);
  },
);

/**
 * PATCH /api/gazoblok/orders/[id] — gazoblok.order. One of three actions:
 *   set_status      — move through PLACED → IN_PRODUCTION → DELIVERED / CANCELED.
 *                     DELIVERED decrements stock; CANCELED of a delivered order restocks.
 *   record_payment  — add a PENDING_CONFIRMATION payment.
 *   confirm_payment — confirm/reject a payment, recompute confirmedPaid + paymentState.
 */
export const PATCH = withPermission<{ id: string }>(
  "gazoblok.order",
  async (req: NextRequest, { user, params }) => {
    const body = GazoblokOrderActionSchema.parse(await req.json());
    const order = await prisma.gazoblokOrder.findUnique({
      where: { id: params.id },
      include: { lines: true },
    });
    if (!order) return fail("Буюртма топилмади · Order not found", 404);

    // ── set_status ──────────────────────────────────────────────
    if (body.action === "set_status") {
      if (order.status === "CANCELED") {
        return fail("Бекор қилинган буюртмани ўзгартириб бўлмайди · Cannot change a canceled order", 409);
      }
      const next = body.status;
      const lineMoves = order.lines.map((l) => ({ productId: l.productId, quantity: l.quantity }));

      const updated = await prisma.$transaction(async (tx) => {
        const data: Prisma.GazoblokOrderUpdateInput = { status: next };

        if (next === "DELIVERED" && order.status !== "DELIVERED") {
          data.deliveredAt = new Date();
          if (body.deliveryProofUrl) {
            data.deliveryProofUrl = body.deliveryProofUrl;
            data.deliveryProofUploadedAt = new Date();
          }
          await decrementGazoblokForOrder(tx, order.id, lineMoves, user.id);
        }
        if (next === "CANCELED") {
          data.canceledAt = new Date();
          if (body.reason) data.cancelReason = body.reason;
          if (order.status === "DELIVERED") {
            await restockGazoblokForCancellation(tx, order.id, lineMoves, user.id, "order canceled");
          }
        }

        const o = await tx.gazoblokOrder.update({ where: { id: order.id }, data });
        await tx.gazoblokOrderEvent.create({
          data: {
            orderId: order.id,
            type: "STATUS_CHANGED",
            actorId: user.id,
            message: `Status ${order.status} → ${next}`,
            payload: { from: order.status, to: next },
          },
        });
        return o;
      });

      recordAudit({
        userId: user.id,
        action: "gazoblok.order.status",
        targetType: "gazoblok_order",
        targetId: order.id,
        message: `${order.orderNumber}: ${order.status} → ${next}`,
      });
      return ok(updated);
    }

    // ── record_payment ──────────────────────────────────────────
    if (body.action === "record_payment") {
      const payment = await prisma.$transaction(async (tx) => {
        const p = await tx.gazoblokPayment.create({
          data: {
            orderId: order.id,
            amount: body.amount,
            method: body.method,
            status: "PENDING_CONFIRMATION",
            recordedById: user.id,
            notes: body.notes ?? null,
          },
        });
        await tx.gazoblokOrderEvent.create({
          data: {
            orderId: order.id,
            type: "PAYMENT_RECORDED",
            actorId: user.id,
            message: `Payment of ${body.amount} recorded (${body.method}).`,
            payload: { paymentId: p.id, amount: body.amount },
          },
        });
        return p;
      });
      recordAudit({
        userId: user.id,
        action: "gazoblok.payment.record",
        targetType: "gazoblok_order",
        targetId: order.id,
        message: `Recorded ${body.amount} (${body.method})`,
      });
      return ok(payment);
    }

    // ── confirm_payment ─────────────────────────────────────────
    const payment = await prisma.gazoblokPayment.findUnique({ where: { id: body.paymentId } });
    if (!payment || payment.orderId !== order.id) {
      return fail("Тўлов топилмади · Payment not found", 404);
    }
    if (payment.status !== "PENDING_CONFIRMATION") {
      return fail("Тўлов аллақачон кўриб чиқилган · Payment already reviewed", 409);
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.gazoblokPayment.update({
        where: { id: payment.id },
        data: body.approve
          ? { status: "CONFIRMED", confirmedById: user.id, confirmedAt: new Date() }
          : {
              status: "REJECTED",
              confirmedById: user.id,
              confirmedAt: new Date(),
              notes: body.rejectionReason ?? payment.notes,
            },
      });

      const agg = await tx.gazoblokPayment.aggregate({
        where: { orderId: order.id, status: "CONFIRMED" },
        _sum: { amount: true },
      });
      const confirmedPaid = Number(agg._sum.amount ?? 0);
      const paymentState = recomputePaymentState(Number(order.totalPrice), confirmedPaid);

      return tx.gazoblokOrder.update({
        where: { id: order.id },
        data: {
          confirmedPaid,
          paymentState,
          events: {
            create: {
              type: body.approve ? "PAYMENT_CONFIRMED" : "PAYMENT_REJECTED",
              actorId: user.id,
              message: body.approve ? "Payment confirmed" : "Payment rejected",
              payload: { paymentId: payment.id },
            },
          },
        },
      });
    });

    recordAudit({
      userId: user.id,
      action: "gazoblok.payment.confirm",
      targetType: "gazoblok_order",
      targetId: order.id,
      message: `${body.approve ? "Confirmed" : "Rejected"} payment`,
    });
    return ok(updated);
  },
);
