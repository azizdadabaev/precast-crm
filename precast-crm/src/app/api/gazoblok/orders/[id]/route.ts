export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import { can } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import {
  decrementGazoblokForOrder,
  restockGazoblokForCancellation,
} from "@/lib/gazoblok-stock";
import { GazoblokOrderActionSchema } from "@/lib/gazoblok-validation";
import { paymentStateFor, remainingBalance } from "@/lib/payment-state";

/** GET /api/gazoblok/orders/[id] — gazoblok.view. Full order detail. */
export const GET = withAuth<{ id: string }>(
  async (_req: NextRequest, { params }) => {
    const order = await prisma.gazoblokOrder.findUnique({
      where: { id: params.id },
      include: {
        client: true,
        lines: { include: { product: { select: { id: true, label: true, lengthM: true, heightM: true, thicknessM: true } } } },
        payments: {
          orderBy: { recordedAt: "desc" },
          include: { receipts: { orderBy: { createdAt: "asc" }, select: { id: true, imageUrl: true } } },
        },
        shipments: { orderBy: { number: "asc" } },
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
 *                     DELIVERED decrements stock and is TERMINAL (no cancel after
 *                     delivery). CANCELED before delivery just closes the order.
 *   record_payment  — add a PENDING_CONFIRMATION payment.
 *   confirm_payment — confirm/reject a payment, recompute confirmedPaid + paymentState.
 */
export const PATCH = withAuth<{ id: string }>(
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
      // A delivered order is TERMINAL — it can't be moved back or canceled (a
      // completed, typically fully-paid order). This also prevents the stock
      // corruption a back-and-forth transition would cause.
      if (order.status === "DELIVERED" && body.status !== "DELIVERED") {
        return fail("Етказилган буюртмани ўзгартириб бўлмайди · A delivered order can't be changed", 409);
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
      if (order.status === "CANCELED") {
        return fail("Бекор қилинган буюртмага тўлов ёзиб бўлмайди · Cannot record payment on a canceled order", 422);
      }
      // Remaining = total − confirmedPaid − sum(PENDING). Blocks double-recording
      // while a previous payment is still in the owner's queue.
      const pendingAgg = await prisma.gazoblokPayment.aggregate({
        where: { orderId: order.id, status: "PENDING_CONFIRMATION" },
        _sum: { amount: true },
      });
      const pendingSum = Number(pendingAgg._sum.amount ?? 0);
      const remaining = remainingBalance(
        Number(order.totalPrice), Number(order.confirmedPaid), 0, pendingSum,
      );
      if (body.amount > remaining + 0.005) {
        return fail(
          `Сумма қолдиқдан ошиб кетди (қолдиқ ${remaining}) · Amount exceeds remaining balance (${remaining})`,
          422,
        );
      }

      // Recorder with payment.confirm is the confirming authority — their own
      // entries skip the queue and land CONFIRMED in one step.
      const autoConfirm = can(user, "payment.confirm");
      const now = new Date();
      const payment = await prisma.$transaction(async (tx) => {
        const p = await tx.gazoblokPayment.create({
          data: {
            orderId: order.id,
            amount: body.amount,
            method: body.method,
            status: autoConfirm ? "CONFIRMED" : "PENDING_CONFIRMATION",
            ...(autoConfirm ? { confirmedById: user.id, confirmedAt: now } : {}),
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
        if (body.receiptUrls.length) {
          await tx.gazoblokReceipt.createMany({
            data: body.receiptUrls.map((url) => ({
              orderId: order.id,
              paymentId: p.id,
              imageUrl: url,
              source: "CRM_UPLOAD" as const,
              uploadedById: user.id,
            })),
          });
        }

        // Auto-confirmed — recompute the order's confirmed total + payment state
        // now (same effect confirm_payment would have had), and log a
        // PAYMENT_CONFIRMED event so the audit trail mirrors a manual confirm.
        if (autoConfirm) {
          const agg = await tx.gazoblokPayment.aggregate({
            where: { orderId: order.id, status: "CONFIRMED" },
            _sum: { amount: true },
          });
          const confirmedPaid = Number(agg._sum.amount ?? 0);
          const paymentState = paymentStateFor(confirmedPaid, 0, Number(order.totalPrice));
          await tx.gazoblokOrder.update({
            where: { id: order.id },
            data: { confirmedPaid, paymentState },
          });
          await tx.gazoblokOrderEvent.create({
            data: {
              orderId: order.id,
              type: "PAYMENT_CONFIRMED",
              actorId: user.id,
              message: `Payment ${p.id.slice(-6)} auto-confirmed (recorder has confirm rights): ${body.amount}`,
              payload: { paymentId: p.id, amount: body.amount, autoConfirmed: true },
            },
          });
        }
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
    // Confirming/rejecting a payment is restricted to users with the
    // maker-checker payment.confirm permission (same authority as the floor
    // side). set_status and record_payment stay open to any logged-in user.
    if (!can(user, "payment.confirm")) {
      return fail("Тўловни тасдиқлашга рухсат йўқ · You can't confirm payments", 403);
    }
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
      const paymentState = paymentStateFor(confirmedPaid, 0, Number(order.totalPrice));

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
