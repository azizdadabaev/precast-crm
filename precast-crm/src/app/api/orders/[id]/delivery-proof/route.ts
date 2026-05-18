export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { saveImageFromFormData, UploadError } from "@/lib/uploads";
import {
  calcSnapshotToInventoryLines,
  decrementForDelivery,
  formatInventoryLabel,
} from "@/lib/inventory";
import { emitNotifications, usersWithPermission } from "@/lib/notifications";

/**
 * POST /api/orders/[id]/delivery-proof
 *
 * Multipart form-data:
 *   - file:                 truck-loaded photo (image/jpeg|png|webp, ≤ 8 MB)
 *   - cashAmount:           number — what the driver collected (string)
 *   - noCashCollected:      "true" if no cash was taken on site
 *   - noCashCollectedNote:  required when noCashCollected = true
 *   - driverReturned:       "true" if driver is already back at office
 *
 * Atomically:
 *   1. Persist the photo (existing inventory decrement stays).
 *   2. Flip status DISPATCHED (or IN_PRODUCTION pre-cash-custody) → DELIVERED.
 *   3. If cashAmount > 0: create a Payment row (PENDING_CONFIRMATION,
 *                          method = CASH, collectedById = dispatch.driverId)
 *   4. If driverReturned: stamp dispatch.returnedAt
 *   5. Inventory decrement + STOCK_WARNING events (existing behavior).
 *
 * Acceptable predecessor statuses are IN_PRODUCTION (no dispatch yet) or
 * DISPATCHED (post-spec). The previous gate that required IN_PRODUCTION
 * is loosened to permit DISPATCHED — driver delivered without going
 * back through the production step.
 */
export const POST = withPermission<{ id: string }>(
  "order.edit",
  async (req: NextRequest, { user, params }) => {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { dispatch: true },
  });
  if (!order) return fail("Order not found", 404);
  if (order.status === "CANCELED") return fail("Cannot modify a canceled order", 422);
  // Accept LOADED (3-step UI: PLACED → LOADED → DELIVERED, no dispatch),
  // DISPATCHED (driver-assigned flow), and IN_PRODUCTION (legacy /
  // direct-to-delivery without going through load).
  if (
    order.status !== "LOADED" &&
    order.status !== "IN_PRODUCTION" &&
    order.status !== "DISPATCHED"
  ) {
    return fail(
      `Delivery proof can only be uploaded from LOADED, IN_PRODUCTION, or DISPATCHED (current: ${order.status})`,
      422,
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return fail("Expected multipart/form-data", 400);
  }

  const file = formData.get("file");
  let saved;
  try {
    saved = await saveImageFromFormData(file, `orders/${order.id}`, `delivery-${Date.now()}`);
  } catch (e) {
    if (e instanceof UploadError) return fail(e.message, e.status);
    throw e;
  }

  // Cash collection fields (all optional — operator may have not pulled
  // any cash from this customer, e.g. they paid by transfer earlier).
  const cashAmountRaw = (formData.get("cashAmount") as string) || "0";
  const cashAmount = Number(cashAmountRaw) || 0;
  const noCashCollected = formData.get("noCashCollected") === "true";
  const noCashCollectedNote = (formData.get("noCashCollectedNote") as string) || "";
  const driverReturned = formData.get("driverReturned") === "true";

  if (noCashCollected) {
    if (cashAmount !== 0) {
      return fail("noCashCollected and cashAmount > 0 are mutually exclusive", 422);
    }
    if (!noCashCollectedNote || noCashCollectedNote.trim().length < 3) {
      return fail("A note explaining why no cash was collected is required", 422);
    }
  }
  if (cashAmount < 0) return fail("cashAmount cannot be negative", 422);

  // Pull calc snapshot for inventory decrement
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: order.projectId },
    include: { calculations: true },
  });
  const inventoryLines = calcSnapshotToInventoryLines(project.calculations);

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
        actorId: user.id,
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

    await tx.galleryPhoto.create({
      data: {
        orderId: order.id,
        kind: "DELIVERY_PROOF",
        url: saved.url,
        uploadedById: user.id,
      },
    });

    // Cash recording: only when amount > 0. (noCashCollected → no row,
    // event-only audit; the spec wants the operator's note in the
    // OrderEvent payload.)
    if (cashAmount > 0) {
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          amount: cashAmount,
          method: "CASH",
          status: "PENDING_CONFIRMATION",
          recordedById: user.id,
          recordedAt: new Date(),
          collectedById: order.dispatch?.driverId ?? null,
          collectedAt: new Date(),
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: "PAYMENT_RECORDED",
          actorId: user.id,
          message: `Cash collected: ${cashAmount} (pending confirmation)`,
          payload: {
            paymentId: payment.id,
            amount: cashAmount,
            method: "CASH",
            collectedById: order.dispatch?.driverId ?? null,
          },
        },
      });
    } else if (noCashCollected) {
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: "NOTE_ADDED",
          actorId: user.id,
          message: `No cash collected on delivery: ${noCashCollectedNote}`,
          payload: { reason: noCashCollectedNote },
        },
      });
    }

    // Driver-returned toggle stamps the dispatch.
    if (driverReturned && order.dispatch && !order.dispatch.returnedAt) {
      await tx.dispatch.update({
        where: { id: order.dispatch.id },
        data: { returnedAt: new Date() },
      });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: "DISPATCH_RETURNED",
          actorId: user.id,
          message: "Driver returned to office (recorded with delivery)",
          payload: { dispatchId: order.dispatch.id },
        },
      });
    }

    // Inventory decrement (existing behavior, unchanged).
    const warnings = await decrementForDelivery(tx, order.id, inventoryLines);
    for (const w of warnings) {
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: "STOCK_WARNING",
          message: `Stock went negative for ${formatInventoryLabel(w.kind, w.beamLength)} (now ${w.resultingQuantity}). Reconcile production log.`,
          payload: w as object,
        },
      });
    }

    return u;
  });

  void (async () => {
    const userIds = await usersWithPermission("payment.confirm");
    void emitNotifications({
      type: "DELIVERY_PROOF_UPLOADED",
      userIds,
      title: `Буюртма #${order.orderNumber} - фото юкланди · Delivery photo uploaded`,
      orderId: order.id,
    });
  })();

  return ok(updated);
});
