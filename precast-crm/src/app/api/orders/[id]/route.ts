export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { OrderUpdateSchema } from "@/lib/validation";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { can } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { deleteOrderCascade } from "@/lib/record-delete";
import { emitNotifications, usersWithPermission } from "@/lib/notifications";
import {
  calcSnapshotToInventoryLines,
  decrementForDelivery,
  formatInventoryLabel,
} from "@/lib/inventory";

type Params = { id: string };

/** GET /api/orders/[id] — order.view */
export const GET = withPermission<Params>("order.view", async (_req: NextRequest, { params, user }) => {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      client: true,
      project: { include: { calculations: { orderBy: { seq: "asc" } } } },
      primaryCalculation: true,
      dispatch: {
        include: {
          driver: { select: { id: true, name: true, phone: true } },
          dispatchedBy: { select: { id: true, name: true } },
        },
      },
      payments: {
        orderBy: { recordedAt: "desc" },
        include: {
          collectedByDriver: { select: { id: true, name: true } },
          recordedBy: { select: { id: true, name: true } },
          handedOverTo: { select: { id: true, name: true } },
          confirmedBy: { select: { id: true, name: true } },
          rejectedBy: { select: { id: true, name: true } },
        },
      },
      receipts: {
        orderBy: { createdAt: "asc" },
        select: { id: true, imageUrl: true, paymentId: true, source: true, createdAt: true },
      },
      events: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { actor: { select: { id: true, name: true, email: true } } },
      },
      shipments: {
        orderBy: { number: "asc" },
        include: {
          driver: { select: { id: true, name: true, phone: true } },
          dispatchedBy: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!order) return fail("Order not found", 404);
  // The conversation link is inbox-only data — strip it for order.view users
  // who lack inbox.access so chat linkage never leaks through the order surface.
  if (order.project && !can(user, "inbox.access")) {
    order.project.conversationId = null;
  }
  return ok(order);
});

/** PATCH /api/orders/[id] — order.edit. Updates status, scheduledAt, notes (with timeline event). */
export const PATCH = withPermission<Params>("order.edit", async (req: NextRequest, { params, user }) => {
  const body = OrderUpdateSchema.parse(await req.json());

  const existing = await prisma.order.findUnique({ where: { id: params.id } });
  if (!existing) return fail("Order not found", 404);
  if (existing.status === "CANCELED") {
    return fail("Cannot modify a canceled order — un-cancel via /cancel endpoint", 422);
  }

  const updates: Record<string, unknown> = {};
  const events: Array<{ type: "STATUS_CHANGED" | "SCHEDULED_DATE_CHANGED" | "NOTE_ADDED"; payload: unknown; message?: string }> = [];

  if (body.status && body.status !== existing.status) {
    updates.status = body.status;
    // Stamp transition timestamps
    if (body.status === "IN_PRODUCTION") updates.productionStartedAt = new Date();
    if (body.status === "DELIVERED") updates.deliveredAt = new Date();
    // PAID is no longer an OrderStatus value (paid-ness lives on
    // OrderPaymentState now). The paidAt timestamp on Order is set by
    // the payment-confirmation flow, not by a status PATCH.
    events.push({
      type: "STATUS_CHANGED",
      payload: { from: existing.status, to: body.status },
      message: `Status: ${existing.status} → ${body.status}`,
    });
  }
  if (body.scheduledAt && body.scheduledAt.getTime() !== existing.scheduledAt.getTime()) {
    updates.scheduledAt = body.scheduledAt;
    events.push({
      type: "SCHEDULED_DATE_CHANGED",
      payload: { from: existing.scheduledAt.toISOString(), to: body.scheduledAt.toISOString() },
    });
  }
  if (body.notes !== undefined && body.notes !== existing.notes) {
    updates.notes = body.notes ?? null;
    if (body.notes) events.push({ type: "NOTE_ADDED", payload: { note: body.notes } });
  }

  if (!Object.keys(updates).length) return ok(existing);

  // Gate DELIVERED: balance must be zero and no pending/loaded shipments.
  if (body.status === "DELIVERED" && existing.status !== "DELIVERED") {
    const orderWithShipments = await prisma.order.findUnique({
      where: { id: params.id },
      select: { totalPrice: true, confirmedPaid: true, shipments: { select: { status: true } } },
    });
    if (orderWithShipments) {
      const remaining = Number(orderWithShipments.totalPrice) - Number(orderWithShipments.confirmedPaid);
      if (remaining > 0) {
        return fail(
          `Тўлов тўлиқ эмас — қолди: ${Math.round(remaining).toLocaleString("ru-RU")} UZS · Payment incomplete`,
          422,
        );
      }
      const pendingShipments = orderWithShipments.shipments.filter(
        (s) => s.status === "PENDING" || s.status === "LOADED",
      );
      if (pendingShipments.length > 0) {
        return fail(
          `${pendingShipments.length} та жўнатма ҳали жўнатилмаган · ${pendingShipments.length} shipment(s) not yet dispatched`,
          422,
        );
      }
    }
  }

  // If this PATCH is what flips the order to DELIVERED, also decrement
  // inventory atomically. The canonical UI path is the delivery-proof
  // endpoint (which carries the truck photo), but we mirror the logic
  // here so any programmatic DELIVERED transition can't bypass the
  // stock book.
  const willTransitionToDelivered =
    body.status === "DELIVERED" && existing.status !== "DELIVERED";
  let inventoryLines: ReturnType<typeof calcSnapshotToInventoryLines> = [];
  if (willTransitionToDelivered) {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: existing.projectId },
      include: { calculations: true },
    });
    inventoryLines = calcSnapshotToInventoryLines(project.calculations);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.order.update({ where: { id: existing.id }, data: updates });
    for (const ev of events) {
      await tx.orderEvent.create({
        data: {
          orderId: existing.id,
          type: ev.type,
          message: ev.message ?? null,
          payload: ev.payload as object,
        },
      });
    }
    if (willTransitionToDelivered) {
      const warnings = await decrementForDelivery(tx, existing.id, inventoryLines);
      for (const w of warnings) {
        await tx.orderEvent.create({
          data: {
            orderId: existing.id,
            type: "STOCK_WARNING",
            message: `Stock went negative for ${formatInventoryLabel(w.kind, w.beamLength)} (now ${w.resultingQuantity}). Reconcile production log.`,
            payload: w as object,
          },
        });
      }
    }
    return u;
  });

  if (body.status && body.status !== existing.status) {
    recordAudit({
      userId: user.id,
      action: "order.status.change",
      targetType: "order",
      targetId: existing.id,
      message: `${existing.orderNumber}: ${existing.status} → ${body.status}`,
      metadata: { from: existing.status, to: body.status, orderNumber: existing.orderNumber },
    });
  }
  // Schedule / notes changes also get their own audit row so the
  // journal shows every operator touch — not just status flips.
  if (
    body.scheduledAt &&
    body.scheduledAt.getTime() !== existing.scheduledAt.getTime()
  ) {
    recordAudit({
      userId: user.id,
      action: "order.schedule.change",
      targetType: "order",
      targetId: existing.id,
      message: `${existing.orderNumber} rescheduled`,
      metadata: {
        orderNumber: existing.orderNumber,
        from: existing.scheduledAt,
        to: body.scheduledAt,
      },
    });
  }
  if (body.notes !== undefined && body.notes !== existing.notes) {
    recordAudit({
      userId: user.id,
      action: "order.notes.change",
      targetType: "order",
      targetId: existing.id,
      message: `${existing.orderNumber} notes updated`,
      metadata: {
        orderNumber: existing.orderNumber,
        previous: existing.notes,
        next: body.notes,
      },
    });
  }

  if (body.status && body.status !== existing.status) {
    const statusText =
      body.status === "IN_PRODUCTION"
        ? "ишлаб чиқаришда · in production"
        : body.status === "DISPATCHED"
          ? "жўнатилди · dispatched"
          : body.status === "DELIVERED"
            ? "етказиб берилди · delivered"
            : body.status.toLowerCase();
    void (async () => {
      const userIds = await usersWithPermission("payment.confirm");
      void emitNotifications({
        type: "ORDER_STATUS_CHANGED",
        userIds,
        title: `Буюртма #${existing.orderNumber} ${statusText}`,
        orderId: existing.id,
      });
    })();
  }

  return ok(updated);
});

/**
 * DELETE /api/orders/[id] — order.delete (owner-only).
 * Hard-removes the order and everything that belongs to it (events,
 * payments, dispatch, shipments, discrepancies, comments, photos). This
 * is for clearing test data — the normal lifecycle uses /cancel, not delete.
 */
export const DELETE = withPermission<Params>(
  "order.delete",
  async (_req: NextRequest, { params, user }) => {
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      select: { id: true, orderNumber: true },
    });
    if (!order) return fail("Order not found", 404);

    await prisma.$transaction((tx) => deleteOrderCascade(tx, order.id));

    recordAudit({
      userId: user.id,
      action: "order.delete",
      targetType: "order",
      targetId: order.id,
      message: `Deleted order ${order.orderNumber} permanently`,
      metadata: { orderNumber: order.orderNumber },
    });
    return ok({ deleted: true });
  },
);
