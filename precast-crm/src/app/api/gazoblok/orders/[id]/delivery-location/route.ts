export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { GAZOBLOK_PERMISSION } from "@/lib/gazoblok-permissions";
import { isOpen } from "@/lib/gazoblok-rules";
import { DeliveryLocationBody } from "@/app/api/orders/[id]/delivery-location/schema";

type Tx = Prisma.TransactionClient;

/** Thrown inside the transaction; turned into a 4xx after rollback. */
class Refused extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function lockOrder(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM gazoblok_orders WHERE id = ${id} FOR UPDATE`;
}

// The stored link is opened by drivers, so only web links are kept (no javascript: etc.).
const Body = DeliveryLocationBody.refine((b) => !b.url || /^https?:\/\//i.test(b.url), {
  message: "Ҳавола http(s) билан бошланиши керак · The link must start with http(s)",
  path: ["url"],
});

/**
 * PATCH /api/gazoblok/orders/[id]/delivery-location — set or clear the delivery map pin
 * (spec §7), same body as the beam-and-block route. Finished orders are final.
 */
export const PATCH = withPermission<{ id: string }>(GAZOBLOK_PERMISSION.editOrder, async (req: NextRequest, { user, params }) => {
  const body = Body.parse(await req.json());
  const clearing = body.lat === null || body.lng === null;
  const data = clearing
    ? { deliveryLat: null, deliveryLng: null, deliveryLocationUrl: null, deliveryLocationLabel: null }
    : {
        deliveryLat: body.lat,
        deliveryLng: body.lng,
        deliveryLocationUrl: body.url ?? null,
        deliveryLocationLabel: body.label?.trim() || null,
      };
  const message = clearing
    ? "Манзил ўчирилди"
    : `Манзил белгиланди: ${data.deliveryLocationLabel ?? `${body.lat}, ${body.lng}`}`;

  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, params.id);
      const order = await tx.gazoblokOrder.findUnique({
        where: { id: params.id },
        select: { id: true, orderNumber: true, status: true, shortClosedAt: true },
      });
      if (!order) throw new Refused(404, "Буюртма топилмади · Order not found");
      if (!isOpen(order)) {
        throw new Refused(409, "Ёпилган буюртманинг манзилини ўзгартириб бўлмайди · The order is finished");
      }
      const updated = await tx.gazoblokOrder.update({
        where: { id: order.id },
        data,
        select: { id: true, deliveryLat: true, deliveryLng: true, deliveryLocationUrl: true, deliveryLocationLabel: true },
      });
      await tx.gazoblokOrderEvent.create({
        data: {
          orderId: order.id,
          type: clearing ? "DELIVERY_LOCATION_CLEARED" : "DELIVERY_LOCATION_SET",
          actorId: user.id,
          message,
          payload: clearing ? {} : { lat: data.deliveryLat, lng: data.deliveryLng, url: data.deliveryLocationUrl, label: data.deliveryLocationLabel },
        },
      });
      return { orderNumber: order.orderNumber, updated };
    });

    recordAudit({
      userId: user.id,
      action: "gazoblok.order.deliveryLocation",
      targetType: "gazoblok_order",
      targetId: result.updated.id,
      message: `${result.orderNumber}: ${message}`,
    });
    return ok(result.updated);
  } catch (e) {
    if (e instanceof Refused) return fail(e.message, e.status);
    throw e;
  }
});
