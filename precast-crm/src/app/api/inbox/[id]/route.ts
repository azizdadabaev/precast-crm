import { ok, fail } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { withInboxAccess } from "@/lib/inbox-auth";

export const GET = withInboxAccess<{ id: string }>(async (_req, { params }) => {
  const conversation = await prisma.conversation.findUnique({
    where: { id: params.id },
    select: { id: true, displayName: true, username: true, externalId: true },
  });
  if (!conversation) return fail("Суҳбат топилмади · Conversation not found", 404);

  const messages = await prisma.message.findMany({
    where: { conversationId: params.id },
    orderBy: { createdAt: "asc" },
    take: 500,
    select: {
      id: true, direction: true, text: true, mediaKind: true,
      mediaPath: true, mediaName: true, mediaMeta: true, failed: true, createdAt: true,
      mediaGroupId: true,
    },
  });

  // Opening a conversation clears its unread flag.
  await prisma.conversation.update({ where: { id: params.id }, data: { unread: false } });

  return ok({ conversation, messages });
});
