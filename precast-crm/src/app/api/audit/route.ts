export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * GET /api/audit — owner-only. Returns paginated audit log entries.
 *
 * Query params:
 *   page      (1-based, default 1)
 *   pageSize  (default 50, max 200)
 *   action    (optional, filter by exact action key like "order.place")
 *   userId    (optional, filter by actor)
 *   targetType (optional, e.g. "project")
 *   targetId   (optional, exact id)
 */
export const GET = withPermission("audit.view", async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, Number(searchParams.get("pageSize") ?? "50") || 50),
  );
  const action = searchParams.get("action")?.trim() || undefined;
  const userId = searchParams.get("userId")?.trim() || undefined;
  const targetType = searchParams.get("targetType")?.trim() || undefined;
  const targetId = searchParams.get("targetId")?.trim() || undefined;

  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (userId) where.userId = userId;
  if (targetType) where.targetType = targetType;
  if (targetId) where.targetId = targetId;

  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    }),
  ]);

  return ok({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});
