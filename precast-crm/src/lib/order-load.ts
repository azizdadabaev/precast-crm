import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Transition a single-truck order to LOADED with its truck photo, recording the
 * full audit trail. Shared by the in-CRM upload route (`/api/orders/[id]/load`)
 * and the Telegram bot's 🚚 Truck flow so both write byte-for-byte the same data.
 *
 * The 3-step UI (PLACED → LOADED → DELIVERED) skips the legacy IN_PRODUCTION
 * step: when starting from PLACED we auto-advance through IN_PRODUCTION inside
 * this transaction, stamping `productionStartedAt` and recording the implicit
 * transition as its own event so the activity log + dashboard KPIs stay correct.
 *
 * Caller must have verified the order is PLACED or IN_PRODUCTION (single-truck,
 * no shipments) and already saved the photo to uploads.
 */
export async function loadOrderWithPhoto(params: {
  orderId: string;
  uploadUrl: string;
  userId: string;
  startingStatus: OrderStatus;
}): Promise<void> {
  const { orderId, uploadUrl, userId, startingStatus } = params;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "LOADED",
        loadedPhotoUrl: uploadUrl,
        loadedAt: now,
        ...(startingStatus === "PLACED" ? { productionStartedAt: now } : {}),
      },
    });

    if (startingStatus === "PLACED") {
      await tx.orderEvent.create({
        data: {
          orderId,
          type: "STATUS_CHANGED",
          actorId: userId,
          message: "Ишлаб чиқаришга ўтказилди",
          payload: { from: "PLACED", to: "IN_PRODUCTION", implicit: true },
        },
      });
    }

    await tx.orderEvent.create({
      data: {
        orderId,
        type: "ORDER_LOADED",
        actorId: userId,
        message: "Юк машинасига юкланди",
        payload: {
          from: startingStatus === "PLACED" ? "IN_PRODUCTION" : startingStatus,
          to: "LOADED",
          photoUrl: uploadUrl,
        },
      },
    });

    await tx.galleryPhoto.create({
      data: { orderId, kind: "LOADED", url: uploadUrl, uploadedById: userId },
    });
  });
}
