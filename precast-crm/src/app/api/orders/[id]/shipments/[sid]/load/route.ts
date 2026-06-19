export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { saveImageFromFormData, UploadError } from "@/lib/uploads";

/**
 * POST /api/orders/[id]/shipments/[sid]/load
 *
 * Multipart form-data:
 *   file:         truck photo (image, ≤ 8 MB)
 *   loadedBeams:  JSON string — Record<string,number> e.g. {"3.3":5,"4.3":10}
 *   loadedBlocks: number (integer string)
 *
 * Sets ShipmentStatus → LOADED.
 */
export const POST = withPermission<{ id: string; sid: string }>(
  "dispatch.create",
  async (req: NextRequest, { user, params }) => {
    const shipment = await prisma.shipment.findFirst({
      where: { id: params.sid, orderId: params.id },
    });
    if (!shipment) return fail("Shipment not found", 404);
    if (shipment.status !== "PENDING") {
      return fail(`Shipment is already ${shipment.status}`, 422);
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return fail("Expected multipart/form-data", 400);
    }

    const beamsRaw = formData.get("loadedBeams");
    const blocksRaw = formData.get("loadedBlocks");

    let loadedBeams: Record<string, number> = {};
    let loadedBlocks = 0;
    try {
      if (beamsRaw) loadedBeams = JSON.parse(String(beamsRaw));
      if (blocksRaw) loadedBlocks = parseInt(String(blocksRaw), 10);
    } catch {
      return fail("Invalid loadedBeams JSON", 400);
    }

    // Over-load guard (defense-in-depth; the client also blocks this): this
    // shipment's load + what the OTHER shipments already loaded must not exceed
    // the order totals. Beam keys use Number(beamLength).toFixed(2) — the same
    // form the loader writes — so they line up.
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      select: {
        project: { select: { calculations: { select: { beamLength: true, beamCount: true, totalBlocks: true } } } },
        shipments: {
          where: { id: { not: params.sid } },
          select: { loadedBeams: true, loadedBlocks: true },
        },
      },
    });
    if (!order) return fail("Order not found", 404);

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
          `Beam ${k}m over-loaded: already ${otherBeams[k] ?? 0} + ${v} exceeds order total ${total}`,
          422,
        );
      }
    }
    if (otherBlocks + loadedBlocks > blocksTotal) {
      return fail(`Blocks over-loaded: already ${otherBlocks} + ${loadedBlocks} exceeds order total ${blocksTotal}`, 422);
    }

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

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.shipment.update({
        where: { id: params.sid },
        data: {
          status: "LOADED",
          loadedPhotoUrl: uploadUrl,
          loadedAt: new Date(),
          loadedBeams,
          loadedBlocks,
        },
      });
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
      return s;
    });

    return ok(updated);
  },
);
