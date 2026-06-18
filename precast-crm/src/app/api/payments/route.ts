export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { PaymentRecordSchema } from "@/lib/validation";
import { ok, fail, created } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { can } from "@/lib/permissions";
import { emitNotifications, usersWithPermission } from "@/lib/notifications";

/**
 * GET /api/payments
 *   ?orderId=...        scope to one order
 *   ?status=PENDING_CONFIRMATION|CONFIRMED|REJECTED   filter
 *
 * Returns payments newest-first with chain-of-custody refs included so
 * the /payments confirmer page can render the chain panel without an
 * extra query.
 */
export const GET = withPermission("payment.view", async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  const where: Record<string, unknown> = {};
  if (orderId) where.orderId = orderId;
  if (status) where.status = status;

  const payments = await prisma.payment.findMany({
    where,
    orderBy: { recordedAt: "desc" },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          totalPrice: true,
          confirmedPaid: true,
          paymentState: true,
          status: true,
          client: { select: { id: true, name: true, phone: true, address: true } },
          dispatch: {
            select: {
              id: true,
              expectedCollection: true,
              returnedAt: true,
              driver: { select: { id: true, name: true } },
            },
          },
          // Order-level (unlinked) receipts so the confirm dialog can show
          // bot-forwarded proof that predates any payment row.
          receipts: {
            where: { paymentId: null },
            orderBy: { createdAt: "asc" },
            select: { id: true, imageUrl: true },
          },
        },
      },
      collectedByDriver: { select: { id: true, name: true, phone: true } },
      recordedBy: { select: { id: true, name: true, email: true } },
      handedOverTo: { select: { id: true, name: true } },
      confirmedBy: { select: { id: true, name: true } },
      rejectedBy: { select: { id: true, name: true } },
      receipts: {
        orderBy: { createdAt: "asc" },
        select: { id: true, imageUrl: true, paymentId: true },
      },
    },
  });
  return ok(payments);
});

/**
 * POST /api/payments
 * Record a Payment row. Three real entry points all land here:
 *   - IN_OFFICE_CASH          customer pays at the office (placement, mid-order)
 *   - BANK_OR_ONLINE          bank transfer / Click / Payme / etc.
 *   - FROM_DRIVER_AT_DELIVERY driver collected on site
 * A recorder WITHOUT `payment.confirm` lands the payment as PENDING_CONFIRMATION;
 * an owner must confirm before it counts toward Order.confirmedPaid. A recorder
 * WHO HAS `payment.confirm` (owner/admin) is the confirming authority, so the
 * payment is created already CONFIRMED in the same transaction — confirmedPaid /
 * paymentState are recomputed immediately and no confirmation queue entry is made.
 *
 * Server enforces:
 *   - Order exists, is not CANCELED, is not (DELIVERED + FULLY_PAID)
 *   - amount <= remaining (= totalPrice − confirmedPaid − sum of PENDING)
 *     so we can't double-record while a previous record is still awaiting confirmation
 *   - handOverNow stamps the office hand-over fields atomically (in-office cash only)
 */
export const POST = withPermission("payment.record", async (req: NextRequest, { user }) => {
  const body = PaymentRecordSchema.parse(await req.json());

  const order = await prisma.order.findUnique({
    where: { id: body.orderId },
    include: {
      payments: {
        where: { status: "PENDING_CONFIRMATION" },
        select: { amount: true },
      },
    },
  });
  if (!order) return fail("Order not found", 404);
  if (order.status === "CANCELED") {
    return fail("Cannot record payment on a canceled order", 422);
  }
  if (order.status === "DELIVERED" && order.paymentState === "FULLY_PAID") {
    return fail("Order is already fully paid", 422);
  }

  // Verify the driver, if one was sent
  if (body.collectedByDriverId) {
    const d = await prisma.driver.findUnique({
      where: { id: body.collectedByDriverId },
      select: { id: true, active: true },
    });
    if (!d) return fail("Driver not found", 422);
    if (!d.active) return fail("Driver is inactive", 422);
  }

  // Remaining = total − confirmedPaid − sum(PENDING). Blocks double-recording
  // while a previous payment is still in the owner's queue.
  const pendingSum = order.payments.reduce((s, p) => s + Number(p.amount), 0);
  const remaining =
    Number(order.totalPrice) - Number(order.confirmedPaid) - pendingSum - Number(order.writeOffAmount);
  if (body.amount > remaining) {
    return fail(
      `Amount (${body.amount}) exceeds remaining balance (${remaining}). ` +
        `Total ${order.totalPrice}, confirmed ${order.confirmedPaid}, pending ${pendingSum}.`,
      422,
    );
  }

  // Owner/admin (has payment.confirm) is the confirming authority — their own
  // entries skip the queue and land CONFIRMED in one step.
  const autoConfirm = can(user, "payment.confirm");
  const now = new Date();
  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        orderId: body.orderId,
        amount: body.amount,
        method: body.method,
        status: autoConfirm ? "CONFIRMED" : "PENDING_CONFIRMATION",
        ...(autoConfirm ? { confirmedById: user.id, confirmedAt: now } : {}),
        recordedById: user.id,
        recordedAt: now,
        // Driver chain: only when driver collected on site.
        collectedById: body.collectedByDriverId ?? null,
        collectedAt: body.source === "FROM_DRIVER_AT_DELIVERY" ? now : null,
        // Office hand-over: only when the operator is passing cash to the
        // owner immediately. Bank/online has no physical handover.
        handedOverToOfficeById: body.handOverNow ? user.id : null,
        handedOverToOfficeAt: body.handOverNow ? now : null,
        notes: body.notes ?? null,
      },
    });
    await tx.orderEvent.create({
      data: {
        orderId: body.orderId,
        type: "PAYMENT_RECORDED",
        actorId: user.id,
        message: buildEventMessage(body),
        payload: {
          paymentId: p.id,
          amount: Number(body.amount),
          method: body.method,
          source: body.source,
          handOverNow: body.handOverNow,
          collectedByDriverId: body.collectedByDriverId ?? null,
        },
      },
    });
    if (body.receiptUrls.length) {
      await tx.receipt.createMany({
        data: body.receiptUrls.map((url) => ({
          orderId: body.orderId,
          paymentId: p.id,
          imageUrl: url,
          source: "CRM_UPLOAD" as const,
          uploadedById: user.id,
        })),
      });
    }

    // Auto-confirmed by an owner/admin — recompute the order's confirmed total +
    // payment state now (same effect the /confirm route would have had), and log
    // a PAYMENT_CONFIRMED event so the audit trail mirrors a manual confirm.
    if (autoConfirm) {
      const sumAgg = await tx.payment.aggregate({
        _sum: { amount: true },
        where: { orderId: body.orderId, status: "CONFIRMED" },
      });
      const confirmedPaid = Number(sumAgg._sum.amount ?? 0);
      const total = Number(order.totalPrice);
      const writeOff = Number(order.writeOffAmount);
      const paymentState =
        confirmedPaid + writeOff >= total
          ? "FULLY_PAID"
          : confirmedPaid > 0
            ? "PARTIALLY_PAID"
            : "AWAITING_PAYMENT";
      await tx.order.update({
        where: { id: body.orderId },
        data: {
          confirmedPaid,
          paymentState,
          ...(paymentState === "FULLY_PAID" && !order.paidAt ? { paidAt: now } : {}),
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: body.orderId,
          type: "PAYMENT_CONFIRMED",
          actorId: user.id,
          message: `Payment ${p.id.slice(-6)} auto-confirmed (recorder has confirm rights): ${body.amount}`,
          payload: { paymentId: p.id, amount: Number(body.amount), autoConfirmed: true },
        },
      });
    }
    return p;
  });

  // Only a pending payment needs an owner to act — notify the confirmers. An
  // auto-confirmed payment has nothing to confirm, so it raises no notification.
  if (!autoConfirm) {
    void (async () => {
      const userIds = await usersWithPermission("payment.confirm");
      void emitNotifications({
        type: "PAYMENT_RECORDED",
        userIds,
        title: `Тўлов ${Math.round(body.amount).toLocaleString("ru-RU")} UZS · буюртма #${order.orderNumber}`,
        body: `${body.method} · ${body.source}`,
        paymentId: payment.id,
        orderId: order.id,
      });
    })();
  }

  return created(payment);
});

function buildEventMessage(body: {
  amount: number;
  method: string;
  source: "IN_OFFICE_CASH" | "BANK_OR_ONLINE" | "FROM_DRIVER_AT_DELIVERY";
  handOverNow: boolean;
}): string {
  const amt = body.amount;
  const m = body.method;
  switch (body.source) {
    case "IN_OFFICE_CASH":
      return body.handOverNow
        ? `${amt} UZS in cash recorded at office and handed to owner — awaiting confirmation`
        : `${amt} UZS in cash recorded at office — awaiting handover and confirmation`;
    case "BANK_OR_ONLINE":
      return `${amt} UZS via ${m} recorded — awaiting owner verification`;
    case "FROM_DRIVER_AT_DELIVERY":
      return `${amt} UZS collected by driver at site — awaiting confirmation`;
  }
}
