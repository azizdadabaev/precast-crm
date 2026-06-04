export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { withInboxAccess } from "@/lib/inbox-auth";
import { tgSendBusinessVoice, tgUploadVoiceGetFileId } from "@/lib/telegram/api";
import { emitInbox } from "@/lib/inbox-bus";
import { saveBufferToUploads } from "@/lib/uploads";

const MAX_VOICE_SIZE_BYTES = 12 * 1024 * 1024; // 12 MB — generous for a voice note

/** Magic-byte check — an OGG container starts with the ASCII tag "OggS". */
function looksLikeOgg(b: Buffer): boolean {
  return b.length >= 4 && b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53;
}

/**
 * POST /api/inbox/[id]/reply-voice — record-and-send a voice message back into
 * the customer's Telegram chat as the business account. Multipart body:
 *   voice: File (audio/ogg OPUS, ≤ 12 MB), duration?: string (seconds)
 *
 * Gated by withInboxAccess. Telegram requires OGG/OPUS for a real voice bubble,
 * so the browser recorder must produce that (see VoiceRecorder). Business
 * connections reject fresh media, so we stage-upload to get a file_id first
 * (same path as photos/PDFs). On Telegram failure we still record a failed
 * OUTBOUND bubble so the UI can show it.
 */
export const POST = withInboxAccess<{ id: string }>(async (req: NextRequest, { params, user }) => {
  const form = await req.formData();
  const file = form.get("voice");
  const durationRaw = form.get("duration");
  const duration =
    typeof durationRaw === "string" && Number.isFinite(Number(durationRaw))
      ? Math.max(0, Math.round(Number(durationRaw)))
      : undefined;

  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return fail("Овозли хабар юборилмади · No voice provided", 422);
  }
  const f = file as File;
  const mime = (f.type || "").toLowerCase();
  if (mime && mime !== "audio/ogg" && mime !== "audio/ogg; codecs=opus") {
    return fail("Фақат OGG/OPUS қабул қилинади · Only OGG/OPUS voice is accepted", 422);
  }
  if (f.size === 0) return fail("Бўш файл · Empty file", 422);
  if (f.size > MAX_VOICE_SIZE_BYTES) {
    return fail("Овоз катта (макс 12 МБ) · Voice too large (max 12 MB)", 413);
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
  if (!looksLikeOgg(buffer)) {
    return fail("Овоз нотўғри (OGG эмас) · Not a valid OGG voice", 422);
  }
  const filename = `out-${Date.now()}.ogg`;
  const mediaPath = await saveBufferToUploads(buffer, `inbox/${conversation.id}`, filename);

  // Business connections reject fresh media (BUSINESS_PEER_USAGE_MISSING), so
  // upload to a staging channel first to obtain a Telegram file_id, then send
  // THAT file_id over the business connection.
  const stagingChat = process.env.TELEGRAM_STAGING_CHAT_ID;

  let telegramMsgId: string | null = null;
  let failed = false;
  let failReason: string | null = null;
  if (!stagingChat) {
    failed = true;
    failReason =
      "TELEGRAM_STAGING_CHAT_ID not set — create a private channel, add the bot as admin, and set its id.";
  } else {
    try {
      const fileId = await tgUploadVoiceGetFileId(stagingChat, buffer, {
        filename,
        contentType: "audio/ogg",
        duration,
      });
      const sent = await tgSendBusinessVoice(
        conversation.businessConnectionId,
        conversation.externalId,
        fileId,
        { duration },
      );
      telegramMsgId = sent.messageId;
    } catch (err) {
      console.error("[inbox reply-voice]", err);
      failed = true; // persist as a failed bubble
      failReason = err instanceof Error ? err.message : String(err);
    }
  }

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "OUTBOUND",
      mediaKind: "VOICE",
      mediaPath,
      mediaName: "voice.ogg",
      mediaMeta: { duration: duration ?? 0, size: f.size },
      telegramMsgId,
      sentById: user.id,
      failed,
    },
    select: {
      id: true, direction: true, text: true, mediaKind: true,
      mediaPath: true, mediaName: true, mediaMeta: true, failed: true, createdAt: true,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), lastSnippet: "[Овоз · Voice]", unread: false },
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
