export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { OrderUpdateSchema } from "@/lib/validation";
import { ok, fail, handler } from "@/lib/api";

/** GET /api/orders/[id] — full order detail with related Project + Client + events */
export const GET = handler(async (_req: NextRequest, ctx: { params: { id: string } }) => {
  const order = await prisma.order.findUnique({
    where: { id: ctx.params.id },
    include: {
      client: true,
      project: { include: { calculations: { orderBy: { createdAt: "asc" } } } },
      primaryCalculation: true,
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
    if (body.status === "PAID") updates.paidAt = new Date();
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
    return u;
  });

  return ok(updated);
});
