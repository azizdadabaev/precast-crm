export const runtime = "nodejs";

import path from "path";
import { promises as fs } from "fs";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { withInboxAccess } from "@/lib/inbox-auth";
import { can } from "@/lib/permissions";
import { tgSendBusinessDocument, tgUploadDocumentGetFileId } from "@/lib/telegram/api";
import { emitInbox } from "@/lib/inbox-bus";

const DRAWINGS_DIR = process.env.DRAWINGS_DIR ?? "/data/drawings";
const Body = z.object({
  drawingId: z.string().min(1),
  caption: z.string().max(1024).optional(),
});

/**
 * POST /api/inbox/[id]/reply-document — send a Blender-generated PDF (a
 * DrawingRequest) into a Telegram chat. The PDF is read server-side by its
 * drawing id (no client upload). Same staging-channel → file_id path as
 * reply-photo, but sendDocument. Gated by inbox.access + blender.bridge.
 */
export const POST = withInboxAccess<{ id: string }>(async (req, { params, user }) => {
  if (!can(user, "blender.bridge")) {
    return fail("Рухсат йўқ · Permission denied (blender.bridge)", 403);
  }
  const { drawingId, caption } = Body.parse(await req.json());

  const drawing = await prisma.drawingRequest.findUnique({
    where: { id: drawingId },
    select: { id: true, status: true, pdfStorageKey: true, pdfSizeBytes: true },
  });
  if (!drawing || drawing.status !== "DELIVERED" || !drawing.pdfStorageKey) {
    return fail("PDF тайёр эмас · PDF not ready", 400);
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
    select: { id: true, externalId: true, businessConnectionId: true },
  });
  if (!conversation) return fail("Суҳбат топилмади · Conversation not found", 404);
  if (!conversation.businessConnectionId) {
    return fail("Бизнес уланиш мавжуд эмас · No business connection for this chat", 400);
  }

  // Read the PDF from disk. basename() guards against path traversal — the
  // file always lives flat in DRAWINGS_DIR (same as the download route).
  const filePath = path.join(DRAWINGS_DIR, path.basename(drawing.pdfStorageKey));
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch {
    return fail("PDF файли топилмади · PDF file missing on server", 404);
  }
  const filename = path.basename(drawing.pdfStorageKey); // <id>.pdf

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
        filename,
        contentType: "application/pdf",
      });
      const sent = await tgSendBusinessDocument(
        conversation.businessConnectionId,
        conversation.externalId,
        fileId,
        { caption },
      );
      telegramMsgId = sent.messageId;
    } catch (err) {
      console.error("[inbox reply-document]", err);
      failed = true;
      failReason = err instanceof Error ? err.message : String(err);
    }
  }

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "OUTBOUND",
      mediaKind: "DOCUMENT",
      // Point the bubble's download at the existing PDF route (blender-gated).
      mediaPath: `/api/drawings/request/${drawing.id}/pdf`,
      mediaName: filename,
      mediaMeta: drawing.pdfSizeBytes ? { size: drawing.pdfSizeBytes } : undefined,
      text: caption ?? null,
      telegramMsgId,
      sentById: user.id,
      failed,
    },
    select: {
      id: true, direction: true, text: true, mediaKind: true,
      mediaPath: true, mediaName: true, failed: true, createdAt: true,
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), lastSnippet: "[Ҳужжат · Document]", unread: false },
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
