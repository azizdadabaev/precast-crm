export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import { saveImageFromFormData, UploadError } from "@/lib/uploads";
import { computeOvership } from "@/lib/gazoblok-overship";
import { paymentStateFor } from "@/lib/payment-state";
import { round2 } from "@/services/calculation-engine";

type Params = { id: string; sid: string };

/**
 * POST /api/gazoblok/orders/[id]/shipments/[sid]/load
 * Multipart: loadedLines (JSON Record<lineId,blocks>), file (0+ photos — optional).
 * Sets status → LOADED. Over-shipment is ALLOWED: loading more blocks than a line
 * ordered grows the payable total by a surcharge (Σ over-blocks × frozen unitPrice).
 * The recompute runs INSIDE the write transaction under a FOR UPDATE lock so a
 * concurrent load reads committed truth and totalPrice stays single-sourced.
 */
export const POST = withAuth<Params>(async (req: NextRequest, { user, params }) => {
  const shipment = await prisma.gazoblokShipment.findFirst({
    where: { id: params.sid, orderId: params.id },
    select: { id: true, status: true, number: true },
  });
  if (!shipment) return fail("Жўнатма топилмади · Shipment not found", 404);
  if (shipment.status === "DELIVERED") return fail("Жўнатма етказилган · Shipment already delivered", 422);

  const order = await prisma.gazoblokOrder.findUnique({
    where: { id: params.id },
    select: { status: true },
  });
  if (!order) return fail("Буюртма топилмади · Order not found", 404);
  if (order.status === "CANCELED" || order.status === "DELIVERED") {
    return fail("Буюртма ёпилган — юклаб бўлмайди · Order is closed — cannot load", 409);
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return fail("Expected multipart/form-data", 400);
  }

  let loadedLines: Record<string, number> = {};
  try {
    const raw = formData.get("loadedLines");
    if (raw) loadedLines = JSON.parse(String(raw));
  } catch {
    return fail("Invalid loadedLines JSON", 400);
  }
  // Coerce to non-negative integers.
  loadedLines = Object.fromEntries(
    Object.entries(loadedLines).map(([k, v]) => [k, Math.max(0, Math.floor(Number(v) || 0))]),
  );

  // Photos are OPTIONAL. Save each provided image. File I/O stays outside the
  // transaction — an orphan file on a rejected load is harmless, a long tx isn't.
  const files = formData.getAll("file").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  const photoUrls: string[] = [];
  try {
    for (const f of files) {
      const { url } = await saveImageFromFormData(f, `gazoblok/orders/${params.id}`, `shipment-${params.sid}-${Date.now()}-${photoUrls.length}`);
      photoUrls.push(url);
    }
  } catch (e) {
    if (e instanceof UploadError) return fail(e.message, e.status);
    throw e;
  }

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      // Lock the order row: serializes concurrent loads of sibling shipments
      // (and set_status) so the overship recompute below reads committed truth
      // instead of a stale READ COMMITTED snapshot.
      await tx.$queryRaw`SELECT id FROM gazoblok_orders WHERE id = ${params.id} FOR UPDATE`;

      const fresh = await tx.gazoblokOrder.findUniqueOrThrow({
        where: { id: params.id },
        select: {
          status: true,
          linesSubtotal: true,
          discountAmount: true,
          deliveryCost: true,
          confirmedPaid: true,
          lines: { select: { id: true, quantity: true, unitPrice: true } },
          shipments: { where: { id: { not: params.sid } }, select: { loadedLines: true } },
        },
      });
      // Re-check under the lock: a racing set_status may have closed the order
      // after the pre-tx fast-path check passed.
      if (fresh.status === "CANCELED" || fresh.status === "DELIVERED") {
        throw new Error("GAZOBLOK_ORDER_CLOSED");
      }

      const s = await tx.gazoblokShipment.update({
        where: { id: params.sid },
        data: {
          status: "LOADED",
          loadedLines,
          loadedAt: new Date(),
          ...(photoUrls.length ? { loadedPhotoUrls: { push: photoUrls } } : {}),
        },
      });

      // Recompute the over-shipment surcharge across ALL shipments (this one
      // included) and fold it into totalPrice; then re-derive paymentState so an
      // over-shipped FULLY_PAID order correctly drops to PARTIALLY_PAID.
      const overLines = fresh.lines.map((l) => ({
        id: l.id,
        quantity: l.quantity,
        unitPrice: Number(l.unitPrice),
      }));
      const otherShipments = fresh.shipments.map((sh) => ({
        loadedLines: sh.loadedLines as Record<string, number> | null,
      }));
      const before = computeOvership(overLines, otherShipments);
      const after = computeOvership(overLines, [...otherShipments, { loadedLines }]);

      const base =
        Number(fresh.linesSubtotal) - Number(fresh.discountAmount) + Number(fresh.deliveryCost);
      const totalPrice = round2(base + after.overshipAmount);
      const paymentState = paymentStateFor(Number(fresh.confirmedPaid), 0, totalPrice);

      await tx.gazoblokOrder.update({
        where: { id: params.id },
        data: { overshipAmount: after.overshipAmount, totalPrice, paymentState },
      });

      const overshipDelta = round2(after.overshipAmount - before.overshipAmount);
      await tx.gazoblokOrderEvent.create({
        data: {
          orderId: params.id,
          type: "SHIPMENT_LOADED",
          actorId: user.id,
          message: `Жўнатма ${shipment.number} юкланди`,
          payload: {
            shipmentId: params.sid,
            number: shipment.number,
            loadedLines,
            // Only surface the surcharge when THIS load pushed a line over.
            ...(overshipDelta > 0
              ? { overshipDelta, overshipAmount: after.overshipAmount }
              : {}),
          },
        },
      });
      return s;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "GAZOBLOK_ORDER_CLOSED") {
      return fail("Буюртма ёпилган — юклаб бўлмайди · Order is closed — cannot load", 409);
    }
    throw e;
  }

  return ok(updated);
});
