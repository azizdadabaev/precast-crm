export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * POST /api/orders/[id]/shipments/[sid]/dispatch
 *
 * Body (JSON):
 *   driverId?:            string | null
 *   truckIdentifier?:     string | null
 *   driverWillCollectCash: boolean
 *   cashToCollect?:       number | null
 *   notes?:               string | null
 *
 * Sets ShipmentStatus → DISPATCHED.
 * If this is the first dispatched shipment, sets Order.status → DISPATCHED.
 */
export const POST = withPermission<{ id: string; sid: string }>(
  "dispatch.create",
  async (req: NextRequest, { user, params }) => {
    const body = await req.json() as {
      driverId?: string | null;
      truckIdentifier?: string | null;
      driverWillCollectCash?: boolean;
      cashToCollect?: number | null;
      notes?: string | null;
    };

    const [shipment, order] = await Promise.all([
      prisma.shipment.findFirst({ where: { id: params.sid, orderId: params.id } }),
      prisma.order.findUnique({
        where: { id: params.id },
        include: { shipments: true },
      }),
    ]);
    if (!shipment || !order) return fail("Shipment or order not found", 404);
    if (shipment.status !== "LOADED") {
      return fail(`Shipment must be LOADED before dispatch (current: ${shipment.status})`, 422);
    }

    if (body.driverId) {
      const driver = await prisma.driver.findUnique({ where: { id: body.driverId } });
      if (!driver || !driver.active) return fail("Driver not found or inactive", 422);
    }

    const isFirstDispatch = !order.shipments.some(
      (s) => s.status === "DISPATCHED" || s.status === "DELIVERED",
    );

    await prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: params.sid },
        data: {
          status: "DISPATCHED",
          driverId: body.driverId ?? null,
          truckIdentifier: body.truckIdentifier ?? null,
          driverWillCollectCash: body.driverWillCollectCash ?? false,
          cashToCollect: body.cashToCollect ?? null,
          dispatchedById: user.id,
          dispatchedAt: new Date(),
          notes: body.notes ?? null,
        },
      });

      if (isFirstDispatch) {
        await tx.order.update({
          where: { id: params.id },
          data: { status: "DISPATCHED" },
        });
      }

      await tx.orderEvent.create({
        data: {
          orderId: params.id,
          type: "SHIPMENT_DISPATCHED",
          actorId: user.id,
          message: `Жўнатма ${shipment.number} жўнатилди${body.driverWillCollectCash ? ` · Ҳайдовчи ${(body.cashToCollect ?? 0).toLocaleString()} UZS олиб келади` : ""}`,
          payload: {
            shipmentId: params.sid,
            number: shipment.number,
            driverId: body.driverId ?? null,
            driverWillCollectCash: body.driverWillCollectCash ?? false,
            cashToCollect: body.cashToCollect ?? null,
          },
        },
      });
    });

    return ok({ dispatched: true });
  },
);
