export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { withInboxAccess } from "@/lib/inbox-auth";
import { tgSendBusinessPhoto } from "@/lib/telegram/api";
import { emitInbox } from "@/lib/inbox-bus";
import { ALLOWED_IMAGE_MIME, MAX_IMAGE_SIZE_BYTES, saveBufferToUploads } from "@/lib/uploads";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
};

/** Magic-byte check — don't trust the client-declared MIME alone. */
function looksLikeImage(b: Buffer): boolean {
  if (b.length < 12) return false;
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true;
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true;
  // WEBP: "RIFF"????"WEBP"
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return true;
  return false;
}

/**
 * POST /api/inbox/[id]/reply-photo — send a rendered quote image back into
 * the customer's Telegram chat as the business account. Multipart body:
 *   photo: File (image/*, ≤ 8 MB), caption?: string
 *
 * Gated by withInboxAccess. Validates the upload before any filesystem write
 * or Telegram call. On Telegram failure, still records a failed OUTBOUND
 * bubble so the UI can offer retry (mirrors the text reply route).
 */
export const POST = withInboxAccess<{ id: string }>(async (req: NextRequest, { params, user }) => {
  const form = await req.formData();
  const file = form.get("photo");
  const captionRaw = form.get("caption");
  const caption =
    typeof captionRaw === "string" && captionRaw.trim() ? captionRaw.trim().slice(0, 1024) : undefined;

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

  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
    select: { id: true, externalId: true, businessConnectionId: true },
  });
  if (!conversation) return fail("Суҳбат топилмади · Conversation not found", 404);
  if (!conversation.businessConnectionId) {
    return fail("Бизнес уланиш мавжуд эмас · No business connection for this chat", 400);
  }

  const buffer = Buffer.from(await f.arrayBuffer());
  if (!looksLikeImage(buffer)) {
    return fail("Расм нотўғри · Not a valid image", 422);
  }
  const ext = EXT_BY_MIME[mime] ?? "jpg";
  const filename = `out-${Date.now()}.${ext}`;
  const mediaPath = await saveBufferToUploads(buffer, `inbox/${conversation.id}`, filename);

  // Business connections reject fresh uploads (BUSINESS_PEER_USAGE_MISSING), so
  // we send the photo by a public URL Telegram fetches. That URL must be
  // publicly reachable: the prod domain (NEXT_PUBLIC_APP_URL) or, for local
  // testing, the dev tunnel set via TELEGRAM_PUBLIC_BASE_URL.
  const base = (process.env.TELEGRAM_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");

  let telegramMsgId: string | null = null;
  let failed = false;
  let failReason: string | null = null;
  if (!base || /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/.test(base)) {
    failed = true;
    failReason =
      "Public base URL not set or not reachable by Telegram. Set TELEGRAM_PUBLIC_BASE_URL to your dev tunnel (or NEXT_PUBLIC_APP_URL to the prod domain) and restart.";
  } else {
    try {
      const sent = await tgSendBusinessPhoto(
        conversation.businessConnectionId,
        conversation.externalId,
        `${base}${mediaPath}`,
        { caption },
      );
      telegramMsgId = sent.messageId;
    } catch (err) {
      console.error("[inbox reply-photo]", err);
      failed = true; // persist as a failed bubble so the UI can offer retry
      failReason = err instanceof Error ? err.message : String(err);
    }
  }

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "OUTBOUND",
      mediaKind: "IMAGE",
      mediaPath,
      text: caption ?? null,
      telegramMsgId,
      sentById: user.id,
      failed,
    },
    select: {
      id: true, direction: true, text: true, mediaKind: true,
      mediaPath: true, failed: true, createdAt: true,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), lastSnippet: "[Расм · Photo]", unread: false },
  });

  emitInbox({ type: "message:new", conversationId: conversation.id, messageId: message.id });

  if (failed) {
    return fail(
      failReason ? `Юборилмади · Send failed — ${failReason}` : "Юборилмади · Send failed",
      502,
      { message, reason: failReason },
    );
  }
  return ok(message);
});
