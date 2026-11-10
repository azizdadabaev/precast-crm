export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { withIdempotency } from "@/lib/idempotency";
import { deliverExtras, deliverMessage } from "@/lib/gazoblok-event-payload";

type Params = { id: string; sid: string };

/** PATCH /api/gazoblok/orders/[id]/shipments/[sid] — mark a loaded shipment
 *  delivered. Simple flow: LOADED → DELIVERED (loading is the proof the goods
 *  left the warehouse, so an unloaded shipment can't be delivered). */
export const PATCH = withPermission<Params>("order.edit", withIdempotency<Params>(async (_req: NextRequest, { user, params }) => {
  const shipment = await prisma.gazoblokShipment.findFirst({
    where: { id: params.sid, orderId: params.id },
    select: { id: true, status: true, number: true },
  });
  if (!shipment) return fail("Жўнатма топилмади · Shipment not found", 404);
  if (shipment.status === "DELIVERED") return fail("Жўнатма аллақачон етказилган · Already delivered", 409);
  if (shipment.status !== "LOADED") {
    return fail("Аввал жўнатмани юкланг · Shipment must be loaded before delivery", 409);
  }
  const order = await prisma.gazoblokOrder.findUnique({
    where: { id: params.id },
    select: { status: true },
  });
  if (!order) return fail("Буюртма топилмади · Order not found", 404);
  if (order.status === "CANCELED") {
    return fail("Бекор қилинган буюртма жўнатмасини ўзгартириб бўлмайди · Order is canceled", 409);
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Same order lock as a load/correction, so a correction can't write LOADED back over this.
    await tx.$queryRaw`SELECT id FROM gazoblok_orders WHERE id = ${params.id} FOR UPDATE`;
    // Sizes and status read under the lock: an edit or cancel may have committed since the fast check.
    const locked = await tx.gazoblokOrder.findUniqueOrThrow({
      where: { id: params.id },
      select: { status: true, lines: { select: { id: true, productLabel: true, quantity: true } } },
    });
    if (locked.status === "CANCELED") return "CANCELED" as const;
    // Guarded: only a LOADED truck becomes DELIVERED, so a double click can't log it twice.
    const moved = await tx.gazoblokShipment.updateMany({
      where: { id: params.sid, status: "LOADED" },
      data: { status: "DELIVERED", deliveredAt: new Date() },
    });
    if (moved.count === 0) return null;
    const s = await tx.gazoblokShipment.findUniqueOrThrow({ where: { id: params.sid } });
    // The truck's sizes as delivered, read under the lock, go into the history line.
    const delivered = deliverExtras(locked.lines, s.loadedLines as Record<string, number> | null);
    await tx.gazoblokOrderEvent.create({
      data: {
        orderId: params.id,
        type: "SHIPMENT_DELIVERED",
        actorId: user.id,
        message: deliverMessage(shipment.number, delivered),
        payload: { shipmentId: params.sid, number: shipment.number, ...delivered },
      },
    });
    return s;
  });
  if (updated === "CANCELED") {
    return fail("Бекор қилинган буюртма жўнатмасини ўзгартириб бўлмайди · Order is canceled", 409);
  }
  if (!updated) return fail("Жўнатма аллақачон етказилган · Already delivered", 409);
  return ok(updated);
}));

/** DELETE /api/gazoblok/orders/[id]/shipments/[sid] — remove an empty (PENDING)
 *  shipment. Loaded/delivered shipments can't be deleted. Runs under the same order
 *  lock as a load and deletes only while still PENDING: the one-step load's cleanup
 *  must never remove a truck another user has just loaded (its stock is written off). */
export const DELETE = withPermission<Params>("order.edit", async (_req: NextRequest, { params }) => {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM gazoblok_orders WHERE id = ${params.id} FOR UPDATE`;
    const gone = await tx.gazoblokShipment.deleteMany({
      where: { id: params.sid, orderId: params.id, status: "PENDING" },
    });
    if (gone.count > 0) return "DELETED" as const;
    const still = await tx.gazoblokShipment.findFirst({
      where: { id: params.sid, orderId: params.id },
      select: { id: true },
    });
    return still ? ("NOT_EMPTY" as const) : ("MISSING" as const);
  });
  if (result === "MISSING") return fail("Жўнатма топилмади · Shipment not found", 404);
  if (result === "NOT_EMPTY") {
    return fail("Фақат бўш жўнатмани ўчириш мумкин · Only an empty shipment can be deleted", 409);
  }
  return ok({ id: params.sid });
});
