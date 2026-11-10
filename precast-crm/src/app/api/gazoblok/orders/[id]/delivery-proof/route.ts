export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { withIdempotency } from "@/lib/idempotency";
import { saveImageFromFormData, UploadError } from "@/lib/uploads";
import { deliveryProofProblem } from "@/lib/gazoblok-rules";

type Params = { id: string };

/** Thrown inside the transaction when the order was cancelled while the photo uploaded. */
class ProofRefused extends Error {}

/**
 * POST /api/gazoblok/orders/[id]/delivery-proof — the phone's «Етказиш сурати».
 * Multipart: file (one JPG/PNG/WEBP, ≤ 8 MB). Needs order.edit (whoever loads trucks).
 * Saves under /uploads/gazoblok/orders/<id>/, stamps deliveryProofUrl + deliveryProofUploadedAt
 * and logs DELIVERY_PROOF with the actor. Only a photo — it never changes the order's status.
 * Refused on a cancelled order. Idempotent: a retried upload replays the first answer.
 */
export const POST = withPermission<Params>(
  "order.edit",
  withIdempotency<Params>(async (req: NextRequest, { user, params }) => {
    const order = await prisma.gazoblokOrder.findUnique({ where: { id: params.id }, select: { id: true, status: true } });
    if (!order) return fail("Буюртма топилмади · Order not found", 404);
    const problem = deliveryProofProblem(order);
    if (problem) return fail(problem, 409);

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return fail("Расм юборилмади · Expected multipart/form-data", 400);
    }
    let saved;
    try {
      saved = await saveImageFromFormData(formData.get("file"), `gazoblok/orders/${order.id}`, `delivery-${Date.now()}`);
    } catch (e) {
      if (e instanceof UploadError) return fail(e.message, e.status);
      throw e;
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        // Same order lock as status changes, so a cancel can't slip in between the check and the write.
        await tx.$queryRaw`SELECT id FROM gazoblok_orders WHERE id = ${order.id} FOR UPDATE`;
        const now = await tx.gazoblokOrder.findUnique({ where: { id: order.id }, select: { status: true } });
        if (!now || deliveryProofProblem(now)) throw new ProofRefused();
        const uploadedAt = new Date();
        const u = await tx.gazoblokOrder.update({
          where: { id: order.id },
          data: { deliveryProofUrl: saved.url, deliveryProofUploadedAt: uploadedAt },
          select: { deliveryProofUrl: true, deliveryProofUploadedAt: true },
        });
        await tx.gazoblokOrderEvent.create({
          data: {
            orderId: order.id,
            type: "DELIVERY_PROOF",
            actorId: user.id,
            message: "Етказиш сурати юкланди",
            payload: { url: saved.url, size: saved.size, mime: saved.mime },
          },
        });
        return u;
      });
      return ok(updated);
    } catch (e) {
      if (e instanceof ProofRefused) return fail(deliveryProofProblem({ status: "CANCELED" })!, 409);
      throw e;
    }
  }),
);
