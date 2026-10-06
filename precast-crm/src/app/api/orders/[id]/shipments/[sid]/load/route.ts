export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { withIdempotency } from "@/lib/idempotency";
import { saveImageFromFormData, UploadError } from "@/lib/uploads";
import { beamAreaTable, truckArea } from "@/lib/fulfilment";
import { decrementForDelivery, logStockWarnings, shipmentToInventoryLines } from "@/lib/inventory";

/**
 * POST /api/orders/[id]/shipments/[sid]/load
 *
 * Multipart form-data:
 *   file:         truck photo (image, ≤ 8 MB)
 *   loadedBeams:  JSON string — Record<string,number> e.g. {"3.3":5,"4.3":10}
 *   loadedBlocks: number (integer string)
 *
 * Sets ShipmentStatus → LOADED, saves the m² this truck carries (from its
 * beams) and writes its beams + blocks off stock — the goods leave the yard
 * with the truck (owner rule 2026-10-06).
 *
 * Because loading moves stock, the PENDING → LOADED claim is a conditional
 * update inside the transaction: two simultaneous loads of one truck, or a
 * load on an order that is already delivered / canceled / single-truck
 * loaded, cannot write stock off twice.
 */
class LoadConflict extends Error {}

export const POST = withPermission<{ id: string; sid: string }>(
  "dispatch.create",
  withIdempotency<{ id: string; sid: string }>(async (req: NextRequest, { user, params }) => {
    const shipment = await prisma.shipment.findFirst({
      where: { id: params.sid, orderId: params.id },
    });
    if (!shipment) return fail("Жўнатма топилмади · Shipment not found", 404);
    if (shipment.status !== "PENDING") {
      return fail(`Жўнатма аллақачон ${shipment.status} ҳолатида · Shipment is already ${shipment.status}`, 422);
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return fail("Расм юборилмади · Expected multipart/form-data", 400);
    }

    const beamsRaw = formData.get("loadedBeams");
    const blocksRaw = formData.get("loadedBlocks");

    let loadedBeams: Record<string, number> = {};
    let loadedBlocks = 0;
    try {
      if (beamsRaw) loadedBeams = JSON.parse(String(beamsRaw));
      if (blocksRaw) loadedBlocks = parseInt(String(blocksRaw), 10);
    } catch {
      return fail("Юкланган балкалар маълумоти нотўғри · Invalid loadedBeams JSON", 400);
    }

    // Over-load guard (defense-in-depth; the client also blocks this): this
    // shipment's load + what the OTHER shipments already loaded must not exceed
    // the order totals. Beam keys use Number(beamLength).toFixed(2) — the same
    // form the loader writes — so they line up.
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      select: {
        status: true,
        loadedAt: true,
        project: { select: { calculations: { select: { beamLength: true, beamCount: true, totalBlocks: true, monolithArea: true } } } },
        shipments: {
          where: { id: { not: params.sid } },
          select: { loadedBeams: true, loadedBlocks: true },
        },
      },
    });
    if (!order) return fail("Буюртма топилмади · Order not found", 404);
    if (order.status === "DELIVERED" || order.status === "CANCELED") {
      return fail(
        "Етказилган ёки бекор қилинган буюртмага юклаб бўлмайди · Cannot load a truck on a delivered or canceled order",
        422,
      );
    }
    if (order.loadedAt) {
      return fail(
        "Буюртма битта машинада юкланган — жўнатма орқали юклаб бўлмайди · Order already loaded as a single truck",
        422,
      );
    }

    const beamTotals: Record<string, number> = {};
    let blocksTotal = 0;
    for (const c of order.project.calculations) {
      const key = Number(c.beamLength).toFixed(2);
      beamTotals[key] = (beamTotals[key] ?? 0) + c.beamCount;
      blocksTotal += c.totalBlocks;
    }
    const otherBeams: Record<string, number> = {};
    let otherBlocks = 0;
    for (const s of order.shipments) {
      const lb = (s.loadedBeams as Record<string, number> | null) ?? {};
      for (const [k, v] of Object.entries(lb)) otherBeams[k] = (otherBeams[k] ?? 0) + Number(v);
      otherBlocks += s.loadedBlocks ?? 0;
    }
    for (const [k, v] of Object.entries(loadedBeams)) {
      const total = beamTotals[k] ?? 0;
      if ((otherBeams[k] ?? 0) + Number(v) > total) {
        return fail(
          `${k} м балка ортиқча юкланди: ${otherBeams[k] ?? 0} + ${v} буюртмадаги ${total} тадан ошди · Beam ${k}m over-loaded: already ${otherBeams[k] ?? 0} + ${v} exceeds order total ${total}`,
          422,
        );
      }
    }
    if (otherBlocks + loadedBlocks > blocksTotal) {
      return fail(
        `Блоклар ортиқча юкланди: ${otherBlocks} + ${loadedBlocks} буюртмадаги ${blocksTotal} тадан ошди · Blocks over-loaded: already ${otherBlocks} + ${loadedBlocks} exceeds order total ${blocksTotal}`,
        422,
      );
    }

    // m² this truck carries, from its beams. Saved on the truck so a later
    // owner edit of the rooms never rewrites what already left the yard.
    const loadedArea = truckArea(
      loadedBeams,
      beamAreaTable(
        order.project.calculations.map((c) => ({
          beamLength: Number(c.beamLength),
          beamCount: c.beamCount,
          totalBlocks: c.totalBlocks,
          monolithArea: Number(c.monolithArea),
        })),
      ),
    );

    let uploadUrl: string;
    try {
      const { url } = await saveImageFromFormData(
        formData.get("file"),
        `orders/${params.id}`,
        `shipment-${params.sid}-${Date.now()}`,
      );
      uploadUrl = url;
    } catch (e) {
      if (e instanceof UploadError) return fail(e.message, e.status);
      throw e;
    }

    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        // Claim the truck: only a still-PENDING shipment on an open order that
        // was not loaded as a single truck. The row lock makes a concurrent
        // second load see LOADED and match nothing.
        const claimed = await tx.shipment.updateMany({
          where: {
            id: params.sid,
            orderId: params.id,
            status: "PENDING",
            order: { status: { notIn: ["DELIVERED", "CANCELED"] }, loadedAt: null },
          },
          data: {
            status: "LOADED",
            loadedPhotoUrl: uploadUrl,
            loadedAt: new Date(),
            loadedBeams,
            loadedBlocks,
            loadedArea: Math.round(loadedArea * 1000) / 1000,
          },
        });
        if (claimed.count === 0) throw new LoadConflict();
        const s = await tx.shipment.findUniqueOrThrow({ where: { id: params.sid } });
        await tx.orderEvent.create({
          data: {
            orderId: params.id,
            type: "SHIPMENT_LOADED",
            actorId: user.id,
            message: `Жўнатма ${shipment.number} юкланди`,
            payload: { shipmentId: params.sid, number: shipment.number, loadedBeams, loadedBlocks },
          },
        });
        await tx.galleryPhoto.create({
          data: {
            orderId: params.id,
            shipmentId: params.sid,
            kind: "SHIPMENT_LOADED",
            url: uploadUrl,
            uploadedById: user.id,
          },
        });
        // Stock leaves the yard with the truck.
        const warnings = await decrementForDelivery(
          tx,
          params.id,
          shipmentToInventoryLines(loadedBeams, loadedBlocks),
          user.id,
          { shipmentId: params.sid, note: `Жўнатма ${shipment.number}` },
        );
        await logStockWarnings(tx, params.id, warnings);
        return s;
      });
    } catch (e) {
      if (e instanceof LoadConflict) {
        return fail(
          "Бу жўнатмани юклаб бўлмайди — у аллақачон юкланган ёки буюртма ёпилган · Shipment can no longer be loaded",
          422,
        );
      }
      throw e;
    }

    return ok(updated);
  }),
);
