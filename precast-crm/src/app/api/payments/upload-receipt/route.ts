export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { ALLOWED_IMAGE_MIME, MAX_IMAGE_SIZE_BYTES, imageExtFromBytes, saveBufferToUploads } from "@/lib/uploads";

/** POST /api/payments/upload-receipt — payment.record. Store a receipt image the
 *  operator picked; returns { url } to attach to a payment. Multipart: file. */
export const POST = withPermission("payment.record", async (req: NextRequest, { user }) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return fail("Файл юборилмади · No file provided", 422);
  }
  const f = file as File;
  if (!ALLOWED_IMAGE_MIME.has((f.type || "").toLowerCase())) {
    return fail("Фақат расм қабул қилинади · Only JPG, PNG, or WEBP images are accepted", 422);
  }
  if (f.size === 0) return fail("Бўш файл · Empty file", 422);
  if (f.size > MAX_IMAGE_SIZE_BYTES) return fail("Расм катта (макс 8 МБ) · Image too large (max 8 MB)", 413);
  const buffer = Buffer.from(await f.arrayBuffer());
  const ext = imageExtFromBytes(buffer);
  if (!ext) return fail("Расм нотўғри · Not a valid image", 422);
  const url = await saveBufferToUploads(buffer, `receipts/${user.id}`, `${randomUUID()}.${ext}`);
  return ok({ url });
});
