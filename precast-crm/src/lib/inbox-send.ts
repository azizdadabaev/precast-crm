// Shared outbound-send for the Telegram Business inbox: send the text via the
// Bot API, persist the OUTBOUND Message (a failed send is kept as a failed bubble
// for retry), bump the conversation preview, and notify live listeners.
//
// Extracted from the inbox reply route so the agent's Suggest-mode send
// (Plan 09 Slice C) goes through the EXACT same path — same failed-bubble
// handling, same sentById attribution, same live event.

import { prisma } from "@/lib/prisma";
import { tgSendBusinessMessage, tgSendBusinessPhoto, tgUploadPhotoGetFileId } from "@/lib/telegram/api";
import { emitInbox } from "@/lib/inbox-bus";
import { saveBufferToUploads } from "@/lib/uploads";

export interface SentMessage {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  text: string | null;
  failed: boolean;
  createdAt: Date;
}

export type SendBusinessReplyResult =
  | { ok: true; message: SentMessage }
  // SEND_FAILED still persisted a failed bubble (returned in `message`) so the UI
  // can offer retry; NOT_FOUND / NO_CONNECTION wrote nothing.
  | { ok: false; reason: "NOT_FOUND" | "NO_CONNECTION" | "SEND_FAILED"; message?: SentMessage };

/**
 * Send an outbound text reply on a conversation. `userId` is the operator who
 * triggered the send (recorded as Message.sentById); null for system sends.
 */
export async function sendBusinessReply(input: {
  conversationId: string;
  text: string;
  userId: string | null;
}): Promise<SendBusinessReplyResult> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, externalId: true, businessConnectionId: true },
  });
  if (!conversation) return { ok: false, reason: "NOT_FOUND" };
  // Simulated test chats (from /api/agent/simulate-inbound) have no Telegram
  // business connection. Send LOCALLY for them — persist the outbound so the owner
  // can exercise the Suggest flow end-to-end without messaging a real customer. A
  // real chat that genuinely lacks a connection still errors.
  const simulated = !conversation.businessConnectionId && conversation.externalId.startsWith("sim-");
  if (!conversation.businessConnectionId && !simulated) return { ok: false, reason: "NO_CONNECTION" };

  let telegramMsgId: string | null = null;
  let failed = false;
  if (conversation.businessConnectionId) {
    try {
      const sent = await tgSendBusinessMessage(conversation.businessConnectionId, conversation.externalId, input.text);
      telegramMsgId = sent.messageId;
    } catch (err) {
      console.error("[inbox send]", err);
      failed = true; // persist as a failed bubble so the UI can offer retry
    }
  }

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "OUTBOUND",
      text: input.text,
      telegramMsgId,
      sentById: input.userId,
      failed,
    },
    select: { id: true, direction: true, text: true, failed: true, createdAt: true },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), lastSnippet: input.text.slice(0, 80), unread: false },
  });

  emitInbox({ type: "message:new", conversationId: conversation.id, messageId: message.id });

  return failed ? { ok: false, reason: "SEND_FAILED", message } : { ok: true, message };
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
};

export interface SentPhotoMessage {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  text: string | null;
  mediaKind: string | null;
  mediaPath: string | null;
  failed: boolean;
  createdAt: Date;
}

export type SendBusinessPhotoResult =
  | { ok: true; message: SentPhotoMessage }
  // NO_STAGING / SEND_FAILED still persisted a failed bubble (in `message`) for
  // retry; NOT_FOUND / NO_CONNECTION wrote nothing. `detail` carries the reason.
  | {
      ok: false;
      reason: "NOT_FOUND" | "NO_CONNECTION" | "NO_STAGING" | "SEND_FAILED";
      message?: SentPhotoMessage;
      detail?: string;
    };

async function persistOutboundPhoto(
  conversationId: string,
  mediaPath: string,
  caption: string | null,
  telegramMsgId: string | null,
  userId: string | null,
  failed: boolean,
): Promise<SentPhotoMessage> {
  const message = await prisma.message.create({
    data: {
      conversationId,
      direction: "OUTBOUND",
      mediaKind: "IMAGE",
      mediaPath,
      text: caption,
      telegramMsgId,
      sentById: userId,
      failed,
    },
    select: {
      id: true, direction: true, text: true, mediaKind: true,
      mediaPath: true, failed: true, createdAt: true,
    },
  });
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastMessageAt: new Date(), lastSnippet: "[Расм · Photo]", unread: false },
  });
  emitInbox({ type: "message:new", conversationId, messageId: message.id });
  return message as SentPhotoMessage;
}

/**
 * Send an outbound PHOTO reply (a rendered quote image) on a conversation. Saves
 * the bytes to /uploads, sends over the Telegram Business connection via the
 * staging-channel file_id workaround (business connections reject fresh media),
 * and persists the OUTBOUND IMAGE message — a failed send is kept as a failed
 * bubble for retry. Simulated chats (`sim-…`) with no business connection persist
 * LOCALLY (no Telegram call) so the agent's Auto flow can be exercised end-to-end
 * without messaging a real customer. Mirrors sendBusinessReply's contract.
 */
export async function sendBusinessPhoto(input: {
  conversationId: string;
  photo: Buffer;
  mime: string;
  caption?: string | null;
  userId: string | null;
  filename?: string;
}): Promise<SendBusinessPhotoResult> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: input.conversationId },
    select: { id: true, externalId: true, businessConnectionId: true },
  });
  if (!conversation) return { ok: false, reason: "NOT_FOUND" };

  const simulated = !conversation.businessConnectionId && conversation.externalId.startsWith("sim-");
  if (!conversation.businessConnectionId && !simulated) return { ok: false, reason: "NO_CONNECTION" };

  const caption = input.caption?.trim() ? input.caption.trim().slice(0, 1024) : null;
  const ext = EXT_BY_MIME[input.mime.toLowerCase()] ?? "png";
  const filename = input.filename ?? `out-${Date.now()}.${ext}`;
  const mediaPath = await saveBufferToUploads(input.photo, `inbox/${conversation.id}`, filename);

  // Simulated chat → persist locally, no Telegram.
  if (!conversation.businessConnectionId) {
    const message = await persistOutboundPhoto(conversation.id, mediaPath, caption, null, input.userId, false);
    return { ok: true, message };
  }

  const stagingChat = process.env.TELEGRAM_STAGING_CHAT_ID;
  if (!stagingChat) {
    const message = await persistOutboundPhoto(conversation.id, mediaPath, caption, null, input.userId, true);
    return { ok: false, reason: "NO_STAGING", message, detail: "TELEGRAM_STAGING_CHAT_ID not set" };
  }

  let telegramMsgId: string | null = null;
  let failed = false;
  let detail: string | undefined;
  try {
    const fileId = await tgUploadPhotoGetFileId(stagingChat, input.photo, {
      filename,
      contentType: input.mime,
    });
    const sent = await tgSendBusinessPhoto(
      conversation.businessConnectionId,
      conversation.externalId,
      fileId,
      { caption: caption ?? undefined },
    );
    telegramMsgId = sent.messageId;
  } catch (err) {
    console.error("[inbox send-photo]", err);
    failed = true;
    detail = err instanceof Error ? err.message : String(err);
  }

  const message = await persistOutboundPhoto(conversation.id, mediaPath, caption, telegramMsgId, input.userId, failed);
  return failed ? { ok: false, reason: "SEND_FAILED", message, detail } : { ok: true, message };
}
