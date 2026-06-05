export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { ok, fail } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_SIZE_BYTES,
  imageExtFromBytes,
  saveBufferToUploads,
} from "@/lib/uploads";

/**
 * POST /api/calculations/upload-drawing — store a drawing the operator
 * drag-dropped onto a calculation that did NOT come from a chat, so they can
 * mark rooms on it exactly like chat-sent images. Multipart body:
 *   file: File (image/jpeg|png|webp, ≤ 8 MB)
 * Returns: { url } — a `/uploads/drafts/<userId>/…` path.
 *
 * Any authenticated, active operator may upload (withAuth). The file is written
 * under the CALLER's own user id so the Save-Project copy step can scope which
 * drafts a project is allowed to pull in (see isAllowedAnnotationSource). On
 * Save, captured drawings are copied into the project's permanent media; an
 * un-saved draft's drafts/<userId>/ files may accumulate — same no-cleanup
 * trade-off documented in uploads.ts for order media.
 */
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return fail("Файл юборилмади · No file provided", 422);
  }
  const f = file as File;
  const mime = (f.type || "").toLowerCase();
  if (!ALLOWED_IMAGE_MIME.has(mime)) {
    return fail("Фақат расм қабул қилинади · Only JPG, PNG, or WEBP images are accepted", 422);
  }
  if (f.size === 0) return fail("Бўш файл · Empty file", 422);
  if (f.size > MAX_IMAGE_SIZE_BYTES) {
    return fail("Расм катта (макс 8 МБ) · Image too large (max 8 MB)", 413);
  }

  const buffer = Buffer.from(await f.arrayBuffer());
  // Sniff the real type from bytes: confirms it's an image AND pins the stored
  // extension to the true format (ignores a mislabeled or renamed upload).
  const ext = imageExtFromBytes(buffer);
  if (!ext) {
    return fail("Расм нотўғри · Not a valid image", 422);
  }
  const url = await saveBufferToUploads(buffer, `drafts/${user.id}`, `${randomUUID()}.${ext}`);
  return ok({ url });
});
