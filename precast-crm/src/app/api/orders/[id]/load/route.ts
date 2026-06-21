export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { saveImageFromFormData, UploadError } from "@/lib/uploads";
import { recordAudit } from "@/lib/audit";
import { loadOrderWithPhoto } from "@/lib/order-load";

/**
 * POST /api/orders/[id]/load
 *
 * Multipart form-data: file (image, ≤ 8 MB)
 *
 * Transitions the order to LOADED and saves the truck-loaded photo.
 *
 * The 3-step UI (PLACED → LOADED → DELIVERED) skips over the legacy
 * IN_PRODUCTION step — when the operator clicks "Load" on a PLACED
 * order, we auto-advance through IN_PRODUCTION inside this same
 * transaction. `productionStartedAt` is stamped so the audit trail
 * still shows when production began, and an extra OrderEvent records
 * the implicit transition.
 *
 * Used by the single-truck flow only; split-shipment loading goes
 * through /shipments/[sid]/load.
 */
export const POST = withPermission<{ id: string }>(
  "order.edit",
  async (req: NextRequest, { user, params }) => {
    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) return fail("Order not found", 404);
    if (order.status !== "PLACED" && order.status !== "IN_PRODUCTION") {
      return fail(
        `Order must be PLACED or IN_PRODUCTION to load (current: ${order.status})`,
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

    await loadOrderWithPhoto({
      orderId: params.id,
      uploadUrl,
      userId: user.id,
      startingStatus: order.status,
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
