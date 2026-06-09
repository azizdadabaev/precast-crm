export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { withInboxAccess } from "@/lib/inbox-auth";
import { sendBusinessPhoto } from "@/lib/inbox-send";
import {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_SIZE_BYTES,
  looksLikeImage,
} from "@/lib/uploads";

/**
 * POST /api/inbox/[id]/reply-photo — send a rendered quote image back into
 * the customer's Telegram chat as the business account. Multipart body:
 *   photo: File (image/*, ≤ 8 MB), caption?: string
 *
 * Gated by withInboxAccess. Validates the upload here (HTTP-form concern), then
 * hands the send + persistence to sendBusinessPhoto (shared with the agent's
 * Auto-mode summary send). On Telegram failure it still records a failed OUTBOUND
 * bubble so the UI can offer retry.
 */
export const POST = withInboxAccess<{ id: string }>(async (req: NextRequest, { params, user }) => {
  const form = await req.formData();
  const file = form.get("photo");
  const captionRaw = form.get("caption");
  const caption = typeof captionRaw === "string" && captionRaw.trim() ? captionRaw.trim() : undefined;

  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return fail("Расм юборилмади · No image provided", 422);
  }
  const f = file as File;
  const mime = (f.type || "").toLowerCase();
  if (!ALLOWED_IMAGE_MIME.has(mime)) {
    return fail("Фақат расм қабул қилинади · Only image files are accepted", 422);
  }
  if (f.size === 0) return fail("Бўш файл · Empty file", 422);
  if (f.size > MAX_IMAGE_SIZE_BYTES) {
    return fail("Расм катта (макс 8 МБ) · Image too large (max 8 MB)", 413);
  }

  const buffer = Buffer.from(await f.arrayBuffer());
  if (!looksLikeImage(buffer)) {
    return fail("Расм нотўғри · Not a valid image", 422);
  }

  const result = await sendBusinessPhoto({
    conversationId: params.id,
    photo: buffer,
    mime,
    caption,
    userId: user.id,
  });

  if (result.ok) return ok(result.message);
  switch (result.reason) {
    case "NOT_FOUND":
      return fail("Суҳбат топилмади · Conversation not found", 404);
    case "NO_CONNECTION":
      return fail("Бизнес уланиш мавжуд эмас · No business connection for this chat", 400);
    default: // NO_STAGING | SEND_FAILED — a failed bubble was persisted for retry
      return fail(
        result.detail ? `Юборилмади · Send failed — ${result.detail}` : "Юборилмади · Send failed",
        502,
        { message: result.message, reason: result.detail },
      );
  }
});
