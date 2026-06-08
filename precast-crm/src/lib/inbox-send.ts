// Shared outbound-send for the Telegram Business inbox: send the text via the
// Bot API, persist the OUTBOUND Message (a failed send is kept as a failed bubble
// for retry), bump the conversation preview, and notify live listeners.
//
// Extracted from the inbox reply route so the agent's Suggest-mode send
// (Plan 09 Slice C) goes through the EXACT same path — same failed-bubble
// handling, same sentById attribution, same live event.

import { prisma } from "@/lib/prisma";
import { tgSendBusinessMessage } from "@/lib/telegram/api";
import { emitInbox } from "@/lib/inbox-bus";

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
