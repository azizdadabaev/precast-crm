export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, handler } from "@/lib/api";
import { saveImageFromFormData, UploadError } from "@/lib/uploads";

/**
 * POST /api/orders/[id]/delivery-proof
 *
 * Multipart form-data with a single `file` field — an image of the truck
 * loaded with the product. Atomically:
 *   1. Persist the file under public/uploads/orders/{orderId}/.
 *   2. Set order.deliveryProofUrl + deliveredAt + status = DELIVERED.
 *   3. Append a STATUS_CHANGED event with the proof URL in its payload.
 *
 * Allowed only when the current status is IN_PRODUCTION (the natural
 * predecessor of DELIVERED). Calls from any other status return 422 to
 * prevent skipping the production step.
 */
export const POST = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const order = await prisma.order.findUnique({ where: { id: ctx.params.id } });
  if (!order) return fail("Order not found", 404);
  if (order.status === "CANCELED") return fail("Cannot modify a canceled order", 422);
  if (order.status !== "IN_PRODUCTION") {
    return fail(
      `Delivery proof can only be uploaded from "IN_PRODUCTION" (current: ${order.status})`,
      422,
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return fail("Expected multipart/form-data with a file field", 400);
  }

  const file = formData.get("file");
  let saved;
  try {
    saved = await saveImageFromFormData(file, `orders/${order.id}`, `delivery-${Date.now()}`);
  } catch (e) {
    if (e instanceof UploadError) return fail(e.message, e.status);
    throw e;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.order.update({
      where: { id: order.id },
      data: {
        status: "DELIVERED",
        deliveredAt: new Date(),
        deliveryProofUrl: saved.url,
        deliveryProofUploadedAt: new Date(),
      },
    });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: "STATUS_CHANGED",
        message: "Delivered — proof photo uploaded",
        payload: {
          from: order.status,
          to: "DELIVERED",
          proofUrl: saved.url,
          size: saved.size,
          mime: saved.mime,
        },
      },
    });
    return u;
  });

  return ok(updated);
});
