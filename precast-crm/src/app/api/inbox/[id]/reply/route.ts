import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { withInboxAccess } from "@/lib/inbox-auth";
import { tgSendBusinessMessage } from "@/lib/telegram/api";
import { emitInbox } from "@/lib/inbox-bus";

const Body = z.object({ text: z.string().trim().min(1).max(4000) });

export const POST = withInboxAccess<{ id: string }>(async (req: NextRequest, { params, user }) => {
  const { text } = Body.parse(await req.json());

  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
    select: { id: true, externalId: true, businessConnectionId: true },
  });
  if (!conversation) return fail("Суҳбат топилмади · Conversation not found", 404);
  if (!conversation.businessConnectionId) {
    return fail("Бизнес уланиш мавжуд эмас · No business connection for this chat", 400);
  }

  let telegramMsgId: string | null = null;
  let failed = false;
  try {
    const sent = await tgSendBusinessMessage(conversation.businessConnectionId, conversation.externalId, text);
    telegramMsgId = sent.messageId;
  } catch (err) {
    console.error("[inbox reply]", err);
    failed = true; // persist as a failed bubble so the UI can offer retry
  }

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "OUTBOUND",
      text,
      telegramMsgId,
      sentById: user.id,
      failed,
    },
    select: { id: true, direction: true, text: true, failed: true, createdAt: true },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), lastSnippet: text.slice(0, 80), unread: false },
  });

  emitInbox({ type: "message:new", conversationId: conversation.id, messageId: message.id });

  if (failed) return fail("Юборилмади · Send failed", 502, { message });
  return ok(message);
});
