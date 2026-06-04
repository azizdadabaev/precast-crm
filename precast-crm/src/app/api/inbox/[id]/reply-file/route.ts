export const runtime = "nodejs";

import path from "path";
import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { withInboxAccess } from "@/lib/inbox-auth";
import { tgSendBusinessDocument, tgUploadDocumentGetFileId } from "@/lib/telegram/api";
import { emitInbox } from "@/lib/inbox-bus";
import { saveBufferToUploads } from "@/lib/uploads";

// Telegram bots can send files up to 50 MB via the Bot API (sendDocument).
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

/** Keep a safe display/transfer basename: strip any path, restrict to a sane
 *  charset, keep the extension. */
function safeName(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "file").trim();
  const cleaned = base.replace(/[^\w.\- ()]/g, "_").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 120) || "file";
}

/**
 * POST /api/inbox/[id]/reply-file — attach-and-send an operator-picked file
 * (any type: PDF, video, doc, …) into the customer's Telegram chat as a
 * document. Multipart body: file: File (≤ 50 MB), caption?: string.
 *
 * Everything is sent via sendDocument (universal — works for any file type),
 * through the same staging-channel → file_id path photos/PDFs use, because
 * business connections reject fresh uploads. On Telegram failure we still
 * record a failed OUTBOUND bubble so the UI can show it.
 */
export const POST = withInboxAccess<{ id: string }>(async (req: NextRequest, { params, user }) => {
  const form = await req.formData();
  const file = form.get("file");
  const captionRaw = form.get("caption");
  const caption =
    typeof captionRaw === "string" && captionRaw.trim() ? captionRaw.trim().slice(0, 1024) : undefined;

  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return fail("Файл юборилмади · No file provided", 422);
  }
  const f = file as File;
  if (f.size === 0) return fail("Бўш файл · Empty file", 422);
  if (f.size > MAX_FILE_SIZE_BYTES) {
    return fail("Файл катта (макс 50 МБ) · File too large (max 50 MB)", 413);
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
    select: { id: true, externalId: true, businessConnectionId: true },
  });
  if (!conversation) return fail("Суҳбат топилмади · Conversation not found", 404);
  if (!conversation.businessConnectionId) {
    return fail("Бизнес уланиш мавжуд эмас · No business connection for this chat", 400);
  }

  const original = safeName(f.name || "file");
  const ext = path.extname(original);
  const buffer = Buffer.from(await f.arrayBuffer());
  // Local copy (unique name) for the CRM bubble's download link; the customer
  // gets the file over Telegram with its original name.
  const localName = `out-${Date.now()}${ext}`;
  const mediaPath = await saveBufferToUploads(buffer, `inbox/${conversation.id}`, localName);
  const contentType = f.type || "application/octet-stream";

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
      const fileId = await tgUploadDocumentGetFileId(stagingChat, buffer, {
        filename: original,
        contentType,
      });
      const sent = await tgSendBusinessDocument(
        conversation.businessConnectionId,
        conversation.externalId,
        fileId,
        { caption },
      );
      telegramMsgId = sent.messageId;
    } catch (err) {
      console.error("[inbox reply-file]", err);
      failed = true;
      failReason = err instanceof Error ? err.message : String(err);
    }
  }

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "OUTBOUND",
      mediaKind: "DOCUMENT",
      mediaPath,
      mediaName: original,
      mediaMeta: { size: f.size },
      text: caption ?? null,
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
    data: { lastMessageAt: new Date(), lastSnippet: `[Файл · ${original}]`, unread: false },
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
