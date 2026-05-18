export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { saveImageFromFormData, UploadError } from "@/lib/uploads";
import { recordAudit } from "@/lib/audit";

/**
 * POST /api/orders/[id]/load
 *
 * Multipart form-data: file (image, ≤ 8 MB)
 *
 * Saves the loaded-truck photo and transitions the order from
 * IN_PRODUCTION → LOADED. Used by the single-truck flow only;
 * split-shipment loading goes through /shipments/[sid]/load.
 */
export const POST = withPermission<{ id: string }>(
  "order.edit",
  async (req: NextRequest, { user, params }) => {
    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) return fail("Order not found", 404);
    if (order.status !== "IN_PRODUCTION") {
      return fail(
        `Order must be IN_PRODUCTION to load (current: ${order.status})`,
        422,
      );
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return fail("Expected multipart/form-data", 400);
    }

    let uploadUrl: string;
    try {
      const { url } = await saveImageFromFormData(
        formData.get("file"),
        `orders/${params.id}`,
        `loaded-${Date.now()}`,
      );
      uploadUrl = url;
    } catch (e) {
      if (e instanceof UploadError) return fail(e.message, e.status);
      throw e;
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: params.id },
        data: {
          status: "LOADED",
          loadedPhotoUrl: uploadUrl,
          loadedAt: new Date(),
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: params.id,
          type: "ORDER_LOADED",
          actorId: user.id,
          message: "Юк машинасига юкланди",
          payload: { from: "IN_PRODUCTION", to: "LOADED", photoUrl: uploadUrl },
        },
      });
      await tx.galleryPhoto.create({
        data: {
          orderId: params.id,
          kind: "LOADED",
          url: uploadUrl,
          uploadedById: user.id,
        },
      });
    });

    recordAudit({
      userId: user.id,
      action: "order.loaded",
      targetType: "order",
      targetId: params.id,
      message: `Order ${order.orderNumber} loaded onto truck`,
    });

    return ok({ loadedPhotoUrl: uploadUrl });
  },
);
