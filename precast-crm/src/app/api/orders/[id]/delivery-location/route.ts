export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { DeliveryLocationBody } from "./schema";

export const PATCH = withPermission<{ id: string }>(
  "order.edit",
  async (req: NextRequest, { params }) => {
    const body = DeliveryLocationBody.parse(await req.json());

    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) return fail("Order not found", 404);

    const clearing = body.lat === null || body.lng === null;
    const data = clearing
      ? {
          deliveryLat: null,
          deliveryLng: null,
          deliveryLocationUrl: null,
          deliveryLocationLabel: null,
        }
      : {
          deliveryLat: body.lat,
          deliveryLng: body.lng,
          deliveryLocationUrl: body.url ?? null,
          deliveryLocationLabel: body.label ?? null,
        };

    const updated = await prisma.order.update({
      where: { id: params.id },
      data,
      select: {
        id: true,
        deliveryLat: true,
        deliveryLng: true,
        deliveryLocationUrl: true,
        deliveryLocationLabel: true,
      },
    });

    return ok(updated);
  },
);
