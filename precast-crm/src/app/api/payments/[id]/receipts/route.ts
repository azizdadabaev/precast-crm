export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { ALLOWED_IMAGE_MIME, MAX_IMAGE_SIZE_BYTES, imageExtFromBytes, saveBufferToUploads } from "@/lib/uploads";

/** POST /api/payments/[id]/receipts — payment.record. Attach a receipt image to an
 *  existing payment (e.g. one recorded earlier without a receipt). Multipart: file. */
export const POST = withPermission<{ id: string }>("payment.record", async (req: NextRequest, { user, params }) => {
  const payment = await prisma.payment.findUnique({ where: { id: params.id }, select: { id: true, orderId: true } });
  if (!payment) return fail("Payment not found", 404);

  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) return fail("No file provided", 422);
  const f = file as File;
  if (!ALLOWED_IMAGE_MIME.has((f.type || "").toLowerCase())) return fail("Only JPG, PNG, or WEBP images are accepted", 422);
  if (f.size === 0) return fail("Empty file", 422);
  if (f.size > MAX_IMAGE_SIZE_BYTES) return fail("Image too large (max 8 MB)", 413);
  const buffer = Buffer.from(await f.arrayBuffer());
  const ext = imageExtFromBytes(buffer);
  if (!ext) return fail("Not a valid image", 422);

  const url = await saveBufferToUploads(buffer, `receipts/${user.id}`, `${randomUUID()}.${ext}`);
  const receipt = await prisma.receipt.create({
    data: { orderId: payment.orderId, paymentId: payment.id, imageUrl: url, source: "CRM_UPLOAD", uploadedById: user.id },
    select: { id: true, imageUrl: true },
  });
  return ok(receipt);
});
