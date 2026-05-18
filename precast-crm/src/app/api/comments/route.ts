export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { CommentInboxSchema } from "@/lib/validation";

/**
 * GET /api/comments — unified inbox.
 *
 * Cursor pagination over the global non-deleted comment stream,
 * ordered newest first. Cursor is a comment id; we look up its
 * createdAt and slice to rows older than that.
 */
export const GET = withPermission("order.view", async (req: NextRequest) => {
  const { cursor, limit, entityType } = CommentInboxSchema.parse(
    Object.fromEntries(req.nextUrl.searchParams),
  );

  let cursorTimestamp: Date | null = null;
  if (cursor) {
    const c = await prisma.comment.findUnique({
      where: { id: cursor },
      select: { createdAt: true },
    });
    cursorTimestamp = c?.createdAt ?? null;
  }

  const where = {
    deletedAt: null,
    ...(entityType === "order" ? { orderId: { not: null } } : {}),
    ...(entityType === "project" ? { projectId: { not: null } } : {}),
    ...(cursorTimestamp ? { createdAt: { lt: cursorTimestamp } } : {}),
  };

  const comments = await prisma.comment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    include: {
      author: { select: { id: true, name: true, role: true } },
      order: {
        select: {
          id: true,
          orderNumber: true,
          client: { select: { id: true, name: true } },
        },
      },
      project: {
        select: {
          id: true,
          draftNumber: true,
          name: true,
          tentativeClientName: true,
          client: { select: { id: true, name: true } },
        },
      },
    },
  });

  const hasNextPage = comments.length > limit;
  const page = hasNextPage ? comments.slice(0, limit) : comments;
  const nextCursor = hasNextPage ? page[page.length - 1].id : null;

  return ok({ comments: page, nextCursor, hasNextPage });
});
