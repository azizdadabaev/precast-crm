export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, created, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { withIdempotency } from "@/lib/idempotency";
import { isOpen } from "@/lib/gazoblok-rules";

type Params = { id: string };

/** GET /api/gazoblok/orders/[id]/shipments — list shipments for the order. */
export const GET = withPermission<Params>("order.view", async (_req: NextRequest, { params }) => {
  const shipments = await prisma.gazoblokShipment.findMany({
    where: { orderId: params.id },
    orderBy: { number: "asc" },
  });
  return ok(shipments);
});

/** POST /api/gazoblok/orders/[id]/shipments — add an empty (PENDING) shipment.
 *  Allowed while the order isn't delivered/canceled. */
export const POST = withPermission<Params>("order.edit", withIdempotency<Params>(async (_req: NextRequest, { params }) => {
  const order = await prisma.gazoblokOrder.findUnique({
    where: { id: params.id },
    select: { id: true, status: true, shortClosedAt: true },
  });
  if (!order) return fail("Буюртма топилмади · Order not found", 404);
  if (!isOpen(order)) {
    return fail("Бу буюртмага жўнатма қўшиб бўлмайди · Can't add shipments to this order", 422);
  }

  // Two trucks added at the same moment race for the same number: retry once.
  const addNext = async () => {
    const last = await prisma.gazoblokShipment.findFirst({
      where: { orderId: params.id },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    return prisma.gazoblokShipment.create({
      data: { orderId: params.id, number: (last?.number ?? 0) + 1, status: "PENDING" },
    });
  };
  let shipment;
  try {
    shipment = await addNext();
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e;
    shipment = await addNext();
  }
  return created(shipment);
}));
