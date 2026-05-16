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
      return s;
    });

    return ok(updated);
  },
);
