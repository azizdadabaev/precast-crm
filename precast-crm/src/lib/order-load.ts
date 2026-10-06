import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calcSnapshotToInventoryLines, decrementForDelivery, logStockWarnings } from "@/lib/inventory";

/**
 * The order was no longer loadable when the write landed: already loaded
 * (e.g. the CRM button and the Telegram bot at once), moved on, or shipping in
 * split trucks. Loading writes stock off, so it must happen exactly once.
 */
export class OrderLoadConflictError extends Error {}

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
 * The whole order leaves the yard on this one truck, so its beams and blocks
 * are written off stock here, in the same transaction (owner rule 2026-10-06);
 * «Етказилган» later writes off nothing more for it.
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
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: { in: ["PLACED", "IN_PRODUCTION"] }, shipments: { none: {} } },
      data: {
        status: "LOADED",
        loadedPhotoUrl: uploadUrl,
        loadedAt: now,
        ...(startingStatus === "PLACED" ? { productionStartedAt: now } : {}),
      },
    });
    if (claimed.count === 0) throw new OrderLoadConflictError();

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

    const { project } = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { project: { select: { calculations: true } } },
    });
    const warnings = await decrementForDelivery(
      tx,
      orderId,
      calcSnapshotToInventoryLines(project.calculations),
      userId,
      { note: "Битта машина" },
    );
    await logStockWarnings(tx, orderId, warnings);
  });
}
