export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import { saveImageFromFormData, UploadError } from "@/lib/uploads";

type Params = { id: string; sid: string };

/**
 * POST /api/gazoblok/orders/[id]/shipments/[sid]/load
 * Multipart: loadedLines (JSON Record<lineId,blocks>), file (0+ photos — optional).
 * Sets status → LOADED. Over-load guard (this + other shipments ≤ order line totals)
 * runs BEFORE any photo is saved so a rejected load leaves no orphan upload.
 */
export const POST = withAuth<Params>(async (req: NextRequest, { user, params }) => {
  const shipment = await prisma.gazoblokShipment.findFirst({
    where: { id: params.sid, orderId: params.id },
    select: { id: true, status: true, number: true },
  });
  if (!shipment) return fail("Жўнатма топилмади · Shipment not found", 404);
  if (shipment.status === "DELIVERED") return fail("Жўнатма етказилган · Shipment already delivered", 422);

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

  // Over-load guard: this shipment + the OTHER shipments must not exceed the
  // order's per-line block totals.
  const order = await prisma.gazoblokOrder.findUnique({
    where: { id: params.id },
    select: {
      lines: { select: { id: true, quantity: true } },
      shipments: { where: { id: { not: params.sid } }, select: { loadedLines: true } },
    },
  });
  if (!order) return fail("Буюртма топилмади · Order not found", 404);

  const totals = new Map(order.lines.map((l) => [l.id, l.quantity]));
  const other: Record<string, number> = {};
  for (const s of order.shipments) {
    const ll = (s.loadedLines as Record<string, number> | null) ?? {};
    for (const [k, v] of Object.entries(ll)) other[k] = (other[k] ?? 0) + Number(v);
  }
  for (const [lineId, count] of Object.entries(loadedLines)) {
    const total = totals.get(lineId) ?? 0;
    if ((other[lineId] ?? 0) + count > total) {
      return fail(`Жўнатма миқдори ошиб кетди · Line over-loaded: already ${other[lineId] ?? 0} + ${count} > ${total}`, 422);
    }
  }

  // Photos are OPTIONAL. Save each provided image.
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

  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.gazoblokShipment.update({
      where: { id: params.sid },
      data: {
        status: "LOADED",
        loadedLines,
        loadedAt: new Date(),
        ...(photoUrls.length ? { loadedPhotoUrls: { push: photoUrls } } : {}),
      },
    });
    await tx.gazoblokOrderEvent.create({
      data: {
        orderId: params.id,
        type: "SHIPMENT_LOADED",
        actorId: user.id,
        message: `Жўнатма ${shipment.number} юкланди`,
        payload: { shipmentId: params.sid, number: shipment.number, loadedLines },
      },
    });
    return s;
  });

  return ok(updated);
});
