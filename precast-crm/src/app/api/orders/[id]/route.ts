export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { OrderUpdateSchema } from "@/lib/validation";
import { ok, fail, handler } from "@/lib/api";
import {
  calcSnapshotToInventoryLines,
  decrementForDelivery,
  formatInventoryLabel,
} from "@/lib/inventory";

/** GET /api/orders/[id] — full order detail with related Project + Client + events */
export const GET = handler(async (_req: NextRequest, ctx: { params: { id: string } }) => {
  const order = await prisma.order.findUnique({
    where: { id: ctx.params.id },
    include: {
      client: true,
      project: { include: { calculations: { orderBy: { createdAt: "asc" } } } },
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
      events: {
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { id: true, name: true, email: true } } },
      },
    },
  });
  if (!order) return fail("Order not found", 404);
  return ok(order);
});

/** PATCH /api/orders/[id] — update status, scheduledAt, notes (with timeline event) */
export const PATCH = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const body = OrderUpdateSchema.parse(await req.json());

  const existing = await prisma.order.findUnique({ where: { id: ctx.params.id } });
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

  return ok(updated);
});
