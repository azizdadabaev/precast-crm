import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { withInboxAccess } from "@/lib/inbox-auth";

export const GET = withInboxAccess(async () => {
  const conversations = await prisma.conversation.findMany({
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    select: {
      id: true, displayName: true, username: true,
      lastMessageAt: true, lastSnippet: true, unread: true,
    },
  });
  return ok(conversations);
});
