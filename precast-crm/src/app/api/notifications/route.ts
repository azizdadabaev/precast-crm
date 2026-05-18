export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import { NotificationListSchema } from "@/lib/validation";

/** GET /api/notifications — recent feed + unread count for current user. */
export const GET = withAuth(async (req: NextRequest, { user }) => {
  const { searchParams } = new URL(req.url);
  const query = NotificationListSchema.parse({
    limit: searchParams.get("limit") ?? undefined,
    unreadOnly: searchParams.get("unreadOnly") ?? undefined,
  });

  const where: Record<string, unknown> = { userId: user.id };
  if (query.unreadOnly) where.readAt = null;

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: query.limit,
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return ok({ items, unreadCount });
});
