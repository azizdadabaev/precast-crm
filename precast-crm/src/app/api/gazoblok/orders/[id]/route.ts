export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withAuth, withPermission } from "@/lib/api-auth";
import { withIdempotency, bodyScope } from "@/lib/idempotency";
import { can } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { GazoblokOrderActionSchema } from "@/lib/gazoblok-validation";
import { paymentStateFor, remainingBalance } from "@/lib/payment-state";
import { lineQuantities, unpaidOverload } from "@/lib/gazoblok-quantities";
import {
  closeShortPlan,
  nextStatusProblem,
  paymentCeilingProblem,
  recordPaymentProblem,
  reviewPaymentProblem,
} from "@/lib/gazoblok-rules";
import { orderVolumeM3 } from "@/lib/gazoblok-edit";
import { statusChangeText } from "@/lib/gazoblok-text";
import {
  closeShortExtras,
  closeShortMessage,
  paymentDecisionMessage,
  paymentRecordedMessage,
} from "@/lib/gazoblok-event-payload";
import { refundDue, refundProblem } from "@/lib/overpayment";
import { formatNumber } from "@/lib/utils";
import { emitNotifications, usersWithPermission } from "@/lib/notifications";
import { paymentPendingNotice, paymentDecisionNotice, recipients } from "@/lib/gazoblok-notify";

type Tx = Prisma.TransactionClient;

/** Thrown inside a transaction; turned into a 4xx after rollback. */
class Refused extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Lock the order row so money/stock/status writes on one order serialize. */
async function lockOrder(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM gazoblok_orders WHERE id = ${id} FOR UPDATE`;
}

/** Re-aggregate confirmed money (refunds are negative) and the payment state. */
async function recomputePaid(tx: Tx, orderId: string, totalPrice: number) {
  const agg = await tx.gazoblokPayment.aggregate({
    where: { orderId, status: "CONFIRMED" },
    _sum: { amount: true },
  });
  const confirmedPaid = Number(agg._sum.amount ?? 0);
  return { confirmedPaid, paymentState: paymentStateFor(confirmedPaid, 0, totalPrice) };
}

/** GET /api/gazoblok/orders/[id] — order.view. Full order detail, with the order
 *  it was re-ordered from and the re-orders made from it. */
export const GET = withPermission<{ id: string }>("order.view", 
  async (_req: NextRequest, { params }) => {
    const order = await prisma.gazoblokOrder.findUnique({
      where: { id: params.id },
      include: {
        client: true,
        createdBy: { select: { id: true, name: true } },
        lines: { include: { product: { select: { id: true, label: true, lengthM: true, heightM: true, thicknessM: true } } } },
        payments: {
          orderBy: { recordedAt: "desc" },
          include: {
            receipts: { orderBy: { createdAt: "asc" }, select: { id: true, imageUrl: true } },
            recordedBy: { select: { id: true, name: true } },
          },
        },
        shipments: { orderBy: { number: "asc" } },
        sourceOrder: { select: { id: true, orderNumber: true } },
        reorders: { orderBy: { placedAt: "asc" }, select: { id: true, orderNumber: true } },
        events: {
          orderBy: { createdAt: "desc" },
          include: { actor: { select: { id: true, name: true } } },
        },
      },
    });
    if (!order) return fail("Буюртма топилмади · Order not found", 404);
    // The strict picture the screen shows: ordered / loaded / left / over per size,
    // the unpaid part of an over-load, and money owed back.
    return ok({
      ...order,
      quantities: lineQuantities(order.lines, order.shipments),
      unpaidOverload: unpaidOverload({
        overshipAmount: Number(order.overshipAmount),
        totalPrice: Number(order.totalPrice),
        confirmedPaid: Number(order.confirmedPaid),
      }),
      refundDue: refundDue({ status: order.status, totalPrice: order.totalPrice, confirmedPaid: order.confirmedPaid, writeOffAmount: 0 }),
    });
  },
);

/**
 * PATCH /api/gazoblok/orders/[id] — every write locks the order row first.
 *   set_status      — PLACED ⇄ IN_PRODUCTION (order.edit); DELIVERED (order.edit,
 *                     everything loaded or closed short, trucks delivered, paid —
 *                     moves NO stock: stock moved per truck); CANCELED (order.cancel,
 *                     only while nothing is loaded). Finished orders are final.
 *   close_short     — order.edit: bill what was loaded; no more loading.
 *   record_payment  — payment.record: add a payment (ceiling checked under the lock).
 *   confirm_payment — payment.confirm: confirm/reject, recompute confirmedPaid + state.
 *   record_refund   — payment.confirm: money back (negative confirmed payment).
 */
export const PATCH = withAuth<{ id: string }>(
  withIdempotency<{ id: string }>(async (req: NextRequest, { user, params }) => {
    const body = GazoblokOrderActionSchema.parse(await req.json());
    const order = await prisma.gazoblokOrder.findUnique({
      where: { id: params.id },
      include: { lines: true },
    });
    if (!order) return fail("Буюртма топилмади · Order not found", 404);

    // ── set_status ──────────────────────────────────────────────
    if (body.action === "set_status") {
      const next = body.status;
      try {
        const result = await prisma.$transaction(async (tx) => {
          await lockOrder(tx, order.id);
          const fresh = await tx.gazoblokOrder.findUniqueOrThrow({
            where: { id: order.id },
            include: { lines: true, shipments: { select: { status: true, loadedLines: true } } },
          });
          const problem = nextStatusProblem(
            {
              status: fresh.status,
              shortClosedAt: fresh.shortClosedAt,
              quantities: lineQuantities(fresh.lines, fresh.shipments),
              openShipments: fresh.shipments.filter((sh) => sh.status !== "DELIVERED").length,
              remaining: Number(fresh.totalPrice) - Number(fresh.confirmedPaid),
            },
            next,
            { edit: can(user, "order.edit"), cancel: can(user, "order.cancel") },
          );
          if (problem) throw new Refused(problem.status, problem.message);

          const data: Prisma.GazoblokOrderUpdateInput = { status: next };
          if (next === "DELIVERED") {
            data.deliveredAt = new Date();
            if (body.deliveryProofUrl) {
              data.deliveryProofUrl = body.deliveryProofUrl;
              data.deliveryProofUploadedAt = new Date();
            }
          }
          if (next === "CANCELED") {
            data.canceledAt = new Date();
            if (body.reason) data.cancelReason = body.reason;
          }
          await tx.gazoblokOrder.update({ where: { id: order.id }, data });
          await tx.gazoblokOrderEvent.create({
            data: {
              orderId: order.id,
              type: "STATUS_CHANGED",
              actorId: user.id,
              message: statusChangeText(fresh.status, next),
              payload: { from: fresh.status, to: next, ...(body.reason ? { reason: body.reason } : {}) },
            },
          });
          return tx.gazoblokOrder.findUniqueOrThrow({ where: { id: order.id } });
        });

        recordAudit({
          userId: user.id,
          action: "gazoblok.order.status",
          targetType: "gazoblok_order",
          targetId: order.id,
          message: `${order.orderNumber}: ${order.status} → ${next}`,
        });
        // Stock moves per truck now; delivery itself never writes stock off.
        return ok({ ...result, stockWarnings: [] });
      } catch (e) {
        if (e instanceof Refused) return fail(e.message, e.status);
        throw e;
      }
    }

    // ── close_short ─────────────────────────────────────────────
    if (body.action === "close_short") {
      if (!can(user, "order.edit")) return fail("Буюртмани ўзгартиришга рухсат йўқ · You can't change orders", 403);
      try {
        const result = await prisma.$transaction(async (tx) => {
          await lockOrder(tx, order.id);
          const fresh = await tx.gazoblokOrder.findUniqueOrThrow({
            where: { id: order.id },
            include: {
              lines: { include: { product: { select: { lengthM: true, heightM: true, thicknessM: true } } } },
              shipments: { select: { loadedLines: true } },
            },
          });
          const plan = closeShortPlan({
            status: fresh.status,
            shortClosedAt: fresh.shortClosedAt,
            lines: fresh.lines.map((l) => ({ ...l, unitPrice: Number(l.unitPrice) })),
            shipments: fresh.shipments,
            linesSubtotal: Number(fresh.linesSubtotal),
            discountAmount: Number(fresh.discountAmount),
            deliveryCost: Number(fresh.deliveryCost),
          });
          if ("problem" in plan) throw new Refused(409, plan.problem);
          const paid = await recomputePaid(tx, order.id, plan.totalPrice);
          // Volume follows what was actually loaded, like the billed total.
          const loaded = new Map(plan.quantities.map((q) => [q.lineId, q.loaded]));
          const totalVolumeM3 = orderVolumeM3(
            fresh.lines.map((l) => ({
              quantity: loaded.get(l.id) ?? 0,
              product: l.product
                ? { lengthM: Number(l.product.lengthM), heightM: Number(l.product.heightM), thicknessM: Number(l.product.thicknessM) }
                : null,
            })),
          );
          await tx.gazoblokOrder.update({
            where: { id: order.id },
            data: {
              shortClosedAt: new Date(),
              shortCloseReason: body.reason,
              shortClosedById: user.id,
              linesSubtotal: plan.linesSubtotal,
              discountAmount: plan.discountAmount,
              overshipAmount: plan.overshipAmount,
              totalPrice: plan.totalPrice,
              totalBlocks: plan.quantities.reduce((s, l) => s + l.loaded, 0),
              totalVolumeM3,
              paymentState: paid.paymentState,
            },
          });
          const quantities = plan.quantities.map((q) => ({ label: q.label, ordered: q.ordered, loaded: q.loaded }));
          const extras = closeShortExtras({
            quantities,
            totalBefore: Number(fresh.totalPrice),
            totalAfter: plan.totalPrice,
            confirmedPaid: paid.confirmedPaid,
          });
          await tx.gazoblokOrderEvent.create({
            data: {
              orderId: order.id,
              type: "ORDER_SHORT_CLOSED",
              actorId: user.id,
              message: closeShortMessage({
                quantities,
                totalBefore: Number(fresh.totalPrice),
                totalAfter: plan.totalPrice,
                refundDue: extras.refundDue,
                reason: body.reason,
              }),
              payload: {
                reason: body.reason,
                before: { totalPrice: Number(fresh.totalPrice), linesSubtotal: Number(fresh.linesSubtotal) },
                after: { totalPrice: plan.totalPrice, linesSubtotal: plan.linesSubtotal },
                quantities,
                ...extras,
              },
            },
          });
          return tx.gazoblokOrder.findUniqueOrThrow({ where: { id: order.id } });
        });
        recordAudit({
          userId: user.id,
          action: "gazoblok.order.closeShort",
          targetType: "gazoblok_order",
          targetId: order.id,
          message: `${order.orderNumber}: closed short — ${body.reason}`,
        });
        return ok(result);
      } catch (e) {
        if (e instanceof Refused) return fail(e.message, e.status);
        throw e;
      }
    }

    // ── record_payment ──────────────────────────────────────────
    if (body.action === "record_payment") {
      if (!can(user, "payment.record")) return fail("Тўлов ёзишга рухсат йўқ · You can't record payments", 403);
      const early = recordPaymentProblem(order);
      if (early) return fail(early.message, early.status);

      // Recorder with payment.confirm is the confirming authority — their own
      // entries skip the queue and land CONFIRMED in one step.
      const autoConfirm = can(user, "payment.confirm");
      const now = new Date();
      let payment;
      try {
      payment = await prisma.$transaction(async (tx) => {
        // Ceiling under the lock: two payments for the full remainder can't both pass.
        // Remaining = total − confirmedPaid − sum(PENDING).
        await lockOrder(tx, order.id);
        const fresh = await tx.gazoblokOrder.findUniqueOrThrow({
          where: { id: order.id },
          select: { status: true, totalPrice: true, confirmedPaid: true },
        });
        // The order may have been cancelled since the fast check above.
        const closed = recordPaymentProblem(fresh);
        if (closed) throw new Refused(closed.status, closed.message);
        const pendingAgg = await tx.gazoblokPayment.aggregate({
          where: { orderId: order.id, status: "PENDING_CONFIRMATION" },
          _sum: { amount: true },
        });
        const remaining = remainingBalance(
          Number(fresh.totalPrice), Number(fresh.confirmedPaid), 0, Number(pendingAgg._sum.amount ?? 0),
        );
        const tooMuch = paymentCeilingProblem(body.amount, remaining);
        if (tooMuch) throw new Refused(422, tooMuch);
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
            message: paymentRecordedMessage({ amount: body.amount, method: body.method, receipts: body.receiptUrls.length }),
            payload: { paymentId: p.id, amount: body.amount, method: body.method, receipts: body.receiptUrls.length },
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
          const { confirmedPaid, paymentState } = await recomputePaid(tx, order.id, Number(fresh.totalPrice));
          await tx.gazoblokOrder.update({
            where: { id: order.id },
            data: { confirmedPaid, paymentState },
          });
          await tx.gazoblokOrderEvent.create({
            data: {
              orderId: order.id,
              type: "PAYMENT_CONFIRMED",
              actorId: user.id,
              message: paymentDecisionMessage({ approve: true, amount: body.amount, method: body.method, auto: true }),
              payload: { paymentId: p.id, amount: body.amount, method: body.method, autoConfirmed: true },
            },
          });
        }
        return p;
      });
      } catch (e) {
        if (e instanceof Refused) return fail(e.message, e.status);
        throw e;
      }
      recordAudit({
        userId: user.id,
        action: "gazoblok.payment.record",
        targetType: "gazoblok_order",
        targetId: order.id,
        message: `Recorded ${body.amount} (${body.method})`,
      });
      // Bell after commit: a pending payment waits for payment.confirm holders.
      // A notice failure must never fail the recorded payment.
      if (!autoConfirm) {
        const notice = paymentPendingNotice(order, { id: payment.id, amount: body.amount, method: body.method });
        void (async () => {
          try {
            const to = recipients(await usersWithPermission("payment.confirm"), user.id);
            await emitNotifications({ ...notice, userIds: to });
          } catch (err) {
            console.error("[gazoblok] payment-pending notice failed:", err);
          }
        })();
      }
      return ok(payment);
    }

    // ── confirm_payment / record_refund ─────────────────────────
    // Both are restricted to the maker-checker payment.confirm permission
    // (same authority as the floor side).
    if (!can(user, "payment.confirm")) {
      return fail("Тўловни тасдиқлашга рухсат йўқ · You can't confirm payments", 403);
    }

    if (body.action === "record_refund") {
      try {
        const refund = await prisma.$transaction(async (tx) => {
          await lockOrder(tx, order.id);
          const fresh = await tx.gazoblokOrder.findUniqueOrThrow({ where: { id: order.id } });
          const due = refundDue({ status: fresh.status, totalPrice: fresh.totalPrice, confirmedPaid: fresh.confirmedPaid, writeOffAmount: 0 });
          const why = refundProblem(due, body.amount);
          if (why) throw new Refused(422, why);
          const now = new Date();
          const p = await tx.gazoblokPayment.create({
            data: {
              orderId: order.id,
              amount: -body.amount,
              method: body.method,
              status: "CONFIRMED",
              recordedById: user.id,
              confirmedById: user.id,
              confirmedAt: now,
              notes: body.notes ?? "Қайтарилди",
            },
          });
          const paid = await recomputePaid(tx, order.id, Number(fresh.totalPrice));
          await tx.gazoblokOrder.update({ where: { id: order.id }, data: paid });
          await tx.gazoblokOrderEvent.create({
            data: {
              orderId: order.id,
              type: "REFUND_RECORDED",
              actorId: user.id,
              message: `Мижозга қайтарилди: ${formatNumber(body.amount, 2)} UZS (${body.method})`,
              payload: { paymentId: p.id, amount: body.amount, method: body.method },
            },
          });
          return p;
        });
        recordAudit({
          userId: user.id,
          action: "gazoblok.payment.refund",
          targetType: "gazoblok_order",
          targetId: order.id,
          message: `Refunded ${body.amount} (${body.method})`,
        });
        return ok(refund);
      } catch (e) {
        if (e instanceof Refused) return fail(e.message, e.status);
        throw e;
      }
    }
    const payment = await prisma.gazoblokPayment.findUnique({
      where: { id: body.paymentId },
      include: { recordedBy: { select: { name: true } } },
    });
    if (!payment || payment.orderId !== order.id) {
      return fail("Тўлов топилмади · Payment not found", 404);
    }
    if (payment.status !== "PENDING_CONFIRMATION") {
      return fail("Тўлов аллақачон кўриб чиқилган · Payment already reviewed", 409);
    }

    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        await lockOrder(tx, order.id);
        const fresh = await tx.gazoblokOrder.findUniqueOrThrow({
          where: { id: order.id },
          select: { status: true, totalPrice: true },
        });
        // Under the lock, so a cancel can't slip in between the check and the confirm.
        const refused = reviewPaymentProblem(fresh, body.approve);
        if (refused) throw new Refused(refused.status, refused.message);
        const freshTotal = Number(fresh.totalPrice);
        // Compare-and-set: the pre-tx PENDING check above is only a fast path —
        // this guard is what stops two concurrent reviews of the same payment.
        const cas = await tx.gazoblokPayment.updateMany({
          where: { id: payment.id, status: "PENDING_CONFIRMATION" },
          data: body.approve
            ? { status: "CONFIRMED", confirmedById: user.id, confirmedAt: new Date() }
            : {
                status: "REJECTED",
                confirmedById: user.id,
                confirmedAt: new Date(),
                notes: body.rejectionReason ?? payment.notes,
              },
        });
        if (cas.count === 0) throw new Error("GAZOBLOK_PAYMENT_CONFLICT");

        const { confirmedPaid, paymentState } = await recomputePaid(tx, order.id, freshTotal);
        // Amount, method, who recorded it and the reason go into the history line.
        const decided = {
          paymentId: payment.id,
          amount: Number(payment.amount),
          method: payment.method,
          recordedBy: payment.recordedBy?.name ?? null,
          ...(!body.approve && body.rejectionReason ? { reason: body.rejectionReason } : {}),
        };

        return tx.gazoblokOrder.update({
          where: { id: order.id },
          data: {
            confirmedPaid,
            paymentState,
            events: {
              create: {
                type: body.approve ? "PAYMENT_CONFIRMED" : "PAYMENT_REJECTED",
                actorId: user.id,
                message: paymentDecisionMessage({ approve: body.approve, ...decided }),
                payload: decided,
              },
            },
          },
        });
      });
    } catch (e) {
      if (e instanceof Refused) return fail(e.message, e.status);
      if (e instanceof Error && e.message === "GAZOBLOK_PAYMENT_CONFLICT") {
        return fail("Тўлов аллақачон кўриб чиқилган · Payment already reviewed", 409);
      }
      throw e;
    }

    recordAudit({
      userId: user.id,
      action: "gazoblok.payment.confirm",
      targetType: "gazoblok_order",
      targetId: order.id,
      message: `${body.approve ? "Confirmed" : "Rejected"} payment`,
    });
    // Tell the recorder how their payment was decided (after commit, never fatal).
    if (payment.recordedById) {
      const to = recipients([payment.recordedById], user.id);
      const notice = paymentDecisionNotice(order, { id: payment.id, amount: Number(payment.amount) }, body.approve);
      void emitNotifications({ ...notice, userIds: to }).catch((err) =>
        console.error("[gazoblok] payment-decision notice failed:", err),
      );
    }
    return ok(updated);
  }, { scope: bodyScope }),
);
