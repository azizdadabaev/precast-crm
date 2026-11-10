export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import { withIdempotency, formFieldsScope } from "@/lib/idempotency";
import { saveImageFromFormData, UploadError } from "@/lib/uploads";
import { computeOvership } from "@/lib/gazoblok-overship";
import { paymentStateFor } from "@/lib/payment-state";
import { round2 } from "@/services/calculation-engine";
import { can } from "@/lib/permissions";
import { planLoad } from "@/lib/gazoblok-quantities";
import { isOpen, overloadRefusal } from "@/lib/gazoblok-rules";
import { applyGazoblokMovement } from "@/lib/gazoblok-stock";
import { loadExtras, loadMessage } from "@/lib/gazoblok-event-payload";

/** Thrown inside the transaction; turned into a 4xx after rollback. */
class LoadRefused extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

type Params = { id: string; sid: string };

/**
 * POST /api/gazoblok/orders/[id]/shipments/[sid]/load
 * Multipart: loadedLines (JSON Record<lineId,blocks>), file (0+ photos — optional).
 * Sets status → LOADED (a DELIVERED truck stays DELIVERED when corrected).
 * Stock follows the truck (renovation 2026-11): the blocks on it are written off now,
 * and a correction posts only the difference. Over-shipment is ALLOWED but must be
 * confirmed (form field confirmOverload=true): loading more than a line ordered grows
 * the payable total by a surcharge (Σ over-blocks × frozen unitPrice). Everything runs
 * INSIDE one transaction under a FOR UPDATE lock on the order.
 * Permissions: order.edit; a DELIVERED truck also needs order.editShipped.
 */
export const POST = withAuth<Params>(withIdempotency<Params>(async (req: NextRequest, { user, params }) => {
  if (!can(user, "order.edit")) return fail("Юклашга рухсат йўқ · You can't load trucks", 403);
  const shipment = await prisma.gazoblokShipment.findFirst({
    where: { id: params.sid, orderId: params.id },
    select: { id: true, status: true, number: true, loadedLines: true },
  });
  if (!shipment) return fail("Жўнатма топилмади · Shipment not found", 404);
  if (shipment.status === "DELIVERED" && !can(user, "order.editShipped")) {
    return fail("Етказилган жўнатмани тузатишга рухсат йўқ · You can't correct a delivered shipment", 403);
  }

  const order = await prisma.gazoblokOrder.findUnique({
    where: { id: params.id },
    select: {
      status: true,
      shortClosedAt: true,
      lines: { select: { id: true, productId: true, productLabel: true, quantity: true, unitPrice: true } },
      shipments: { where: { id: { not: params.sid } }, select: { loadedLines: true } },
    },
  });
  if (!order) return fail("Буюртма топилмади · Order not found", 404);
  if (!isOpen(order)) {
    return fail("Буюртма ёпилган — юклаб бўлмайди · Order is closed — cannot load", 409);
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return fail("Сўров нотўғри: multipart/form-data керак · Expected multipart/form-data", 400);
  }

  let loadedLines: Record<string, number> = {};
  try {
    const raw = formData.get("loadedLines");
    if (raw) loadedLines = JSON.parse(String(raw));
  } catch {
    return fail("Юкланган қаторлар нотўғри · Invalid loadedLines JSON", 400);
  }
  // Coerce to non-negative integers.
  loadedLines = Object.fromEntries(
    Object.entries(loadedLines).map(([k, v]) => [k, Math.max(0, Math.floor(Number(v) || 0))]),
  );
  const confirmOverload = String(formData.get("confirmOverload") ?? "") === "true";

  // Ask for the over-load confirmation BEFORE saving any photo, so the confirmed
  // retry (which re-sends the same photos) doesn't store them twice. Unlocked read —
  // the same check runs again under the lock below.
  if (!confirmOverload) {
    const { overload } = planLoad({
      lines: order.lines,
      otherShipments: order.shipments,
      prevLoaded: (shipment.loadedLines as Record<string, number> | null) ?? null,
      postedForShipment: {},
      nextLoaded: loadedLines,
    });
    const ask = overloadRefusal(order.lines.map((l) => ({ ...l, unitPrice: Number(l.unitPrice) })), overload);
    if (ask) return fail(ask.message, ask.status, ask.details);
  }

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
          shortClosedAt: true,
          linesSubtotal: true,
          discountAmount: true,
          deliveryCost: true,
          confirmedPaid: true,
          lines: { select: { id: true, productId: true, productLabel: true, quantity: true, unitPrice: true } },
          shipments: { where: { id: { not: params.sid } }, select: { loadedLines: true } },
        },
      });
      // Re-check under the lock: a racing set_status / close short may have closed
      // the order after the pre-tx fast-path check passed.
      if (!isOpen(fresh)) {
        throw new Error("GAZOBLOK_ORDER_CLOSED");
      }
      const current = await tx.gazoblokShipment.findUniqueOrThrow({
        where: { id: params.sid },
        select: { status: true, loadedLines: true },
      });
      // The truck may have been delivered after the pre-tx check.
      if (current.status === "DELIVERED" && !can(user, "order.editShipped")) {
        throw new LoadRefused(403, "Етказилган жўнатмани тузатишга рухсат йўқ · You can't correct a delivered shipment");
      }
      const posted = await tx.gazoblokStockMovement.groupBy({
        by: ["productId"],
        where: { shipmentId: params.sid },
        _sum: { change: true },
      });
      const prevLoaded = (current.loadedLines as Record<string, number> | null) ?? null;
      const plan = planLoad({
        lines: fresh.lines,
        otherShipments: fresh.shipments,
        prevLoaded,
        postedForShipment: Object.fromEntries(posted.map((p) => [p.productId, p._sum.change ?? 0])),
        nextLoaded: loadedLines,
      });
      if (plan.unknownLineIds.length) {
        throw new LoadRefused(422, "Буюртмада йўқ ўлчам юкланди · A size that is not on this order was loaded", {
          unknownLineIds: plan.unknownLineIds,
        });
      }
      if (!confirmOverload) {
        // Race safety: another truck may have loaded since the pre-check.
        const ask = overloadRefusal(fresh.lines.map((l) => ({ ...l, unitPrice: Number(l.unitPrice) })), plan.overload);
        if (ask) throw new LoadRefused(ask.status, ask.message, ask.details);
      }
      const isCorrection = prevLoaded !== null && current.status !== "PENDING";
      for (const m of plan.stockMoves) {
        await applyGazoblokMovement(tx, m.productId, m.change, {
          reason: isCorrection ? "SHIPMENT_CORRECTION" : "SHIPMENT_LOAD",
          orderId: params.id,
          shipmentId: params.sid,
          actorId: user.id,
          note: `Жўнатма ${shipment.number}`,
        });
      }

      const s = await tx.gazoblokShipment.update({
        where: { id: params.sid },
        data: {
          status: current.status === "DELIVERED" ? "DELIVERED" : "LOADED",
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
      // Sizes + counts and the running loaded / left go into the history (owner 2026-11-10).
      const extras = loadExtras({
        lines: fresh.lines,
        otherShipments: fresh.shipments,
        prevLoaded,
        nextLoaded: loadedLines,
        isCorrection,
        photos: photoUrls.length,
      });
      const overBlocks = plan.overload.reduce((s, o) => s + o.extra, 0);
      await tx.gazoblokOrderEvent.create({
        data: {
          orderId: params.id,
          type: isCorrection ? "SHIPMENT_CORRECTED" : "SHIPMENT_LOADED",
          actorId: user.id,
          message: loadMessage(shipment.number, extras, isCorrection, overshipDelta > 0 ? { blocks: overBlocks, amount: overshipDelta } : null),
          payload: {
            shipmentId: params.sid,
            number: shipment.number,
            loadedLines,
            ...(isCorrection ? { before: prevLoaded } : {}),
            ...extras,
            ...(plan.overload.length ? { overloadConfirmed: true, overBlocks } : {}),
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
    if (e instanceof LoadRefused) return fail(e.message, e.status, e.details);
    if (e instanceof Error && e.message === "GAZOBLOK_ORDER_CLOSED") {
      return fail("Буюртма ёпилган — юклаб бўлмайди · Order is closed — cannot load", 409);
    }
    throw e;
  }

  return ok(updated);
}, { scope: formFieldsScope("loadedLines", "confirmOverload") }));
