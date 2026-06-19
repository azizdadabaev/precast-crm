export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, created, fail } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";

type Params = { id: string };

/** GET /api/gazoblok/orders/[id]/shipments — list shipments for the order. */
export const GET = withAuth<Params>(async (_req: NextRequest, { params }) => {
  const shipments = await prisma.gazoblokShipment.findMany({
    where: { orderId: params.id },
    orderBy: { number: "asc" },
  });
  return ok(shipments);
});

/** POST /api/gazoblok/orders/[id]/shipments — add an empty (PENDING) shipment.
 *  Allowed while the order isn't delivered/canceled. */
export const POST = withAuth<Params>(async (_req: NextRequest, { params }) => {
  const order = await prisma.gazoblokOrder.findUnique({
    where: { id: params.id },
    select: { id: true, status: true },
  });
  if (!order) return fail("Буюртма топилмади · Order not found", 404);
  if (order.status === "CANCELED" || order.status === "DELIVERED") {
    return fail("Бу буюртмага жўнатма қўшиб бўлмайди · Can't add shipments to this order", 422);
  }

  const last = await prisma.gazoblokShipment.findFirst({
    where: { orderId: params.id },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const shipment = await prisma.gazoblokShipment.create({
    data: { orderId: params.id, number: (last?.number ?? 0) + 1, status: "PENDING" },
  });
  return created(shipment);
});
