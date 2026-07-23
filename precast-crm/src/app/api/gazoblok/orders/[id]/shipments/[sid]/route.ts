export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";

type Params = { id: string; sid: string };

/** PATCH /api/gazoblok/orders/[id]/shipments/[sid] — mark a loaded shipment
 *  delivered. Simple flow: LOADED → DELIVERED (loading is the proof the goods
 *  left the warehouse, so an unloaded shipment can't be delivered). */
export const PATCH = withAuth<Params>(async (_req: NextRequest, { user, params }) => {
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
    const s = await tx.gazoblokShipment.update({
      where: { id: params.sid },
      data: { status: "DELIVERED", deliveredAt: new Date() },
    });
    await tx.gazoblokOrderEvent.create({
      data: {
        orderId: params.id,
        type: "SHIPMENT_DELIVERED",
        actorId: user.id,
        message: `Жўнатма ${shipment.number} етказилди`,
        payload: { shipmentId: params.sid, number: shipment.number },
      },
    });
    return s;
  });
  return ok(updated);
});

/** DELETE /api/gazoblok/orders/[id]/shipments/[sid] — remove an empty (PENDING)
 *  shipment. Loaded/delivered shipments can't be deleted. */
export const DELETE = withAuth<Params>(async (_req: NextRequest, { params }) => {
  const shipment = await prisma.gazoblokShipment.findFirst({
    where: { id: params.sid, orderId: params.id },
    select: { id: true, status: true },
  });
  if (!shipment) return fail("Жўнатма топилмади · Shipment not found", 404);
  if (shipment.status !== "PENDING") {
    return fail("Фақат бўш жўнатмани ўчириш мумкин · Only an empty shipment can be deleted", 422);
  }
  await prisma.gazoblokShipment.delete({ where: { id: params.sid } });
  return ok({ id: params.sid });
});
