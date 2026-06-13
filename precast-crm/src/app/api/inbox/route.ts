import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { withInboxAccess } from "@/lib/inbox-auth";

export const GET = withInboxAccess(async () => {
  // The header per-channel counts come from a real DB groupBy — NOT the length of
  // the (capped) list — so "Instagram 99" can't happen when there are 100+ chats.
  const [conversations, grouped] = await Promise.all([
    prisma.conversation.findMany({
      orderBy: { lastMessageAt: "desc" },
      take: 500,
      select: {
        id: true, channel: true, displayName: true, username: true,
        lastMessageAt: true, lastSnippet: true, unread: true,
      },
    }),
    prisma.conversation.groupBy({ by: ["channel"], _count: { _all: true } }),
  ]);
  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.channel ?? "TELEGRAM"] = g._count._all;
  return ok({ conversations, counts });
});
