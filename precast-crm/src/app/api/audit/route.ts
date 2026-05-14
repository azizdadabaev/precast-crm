export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * GET /api/audit — owner-only. Returns paginated audit log entries.
 *
 * Query params:
 *   page       (1-based, default 1)
 *   pageSize   (default 50, max 200)
 *   action     (optional, filter by exact action key like "order.place")
 *   userId     (optional, filter by actor)
 *   targetType (optional, e.g. "project")
 *   targetId   (optional, exact id)
 *   from       (optional, "YYYY-MM-DD" — inclusive lower bound, local TZ)
 *   to         (optional, "YYYY-MM-DD" — inclusive upper bound, local TZ)
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
  const from = searchParams.get("from")?.trim() || undefined;
  const to = searchParams.get("to")?.trim() || undefined;

  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (userId) where.userId = userId;
  if (targetType) where.targetType = targetType;
  if (targetId) where.targetId = targetId;

  // Date window — both ends optional, both inclusive on a per-day
  // basis. We anchor in server-local TZ to match every other day-
  // bucketing helper in the app (see /api/orders day filter +
  // docker-compose.yml's TZ=Asia/Tashkent pin).
  const dayRe = /^\d{4}-\d{2}-\d{2}$/;
  const createdAt: Record<string, Date> = {};
  if (from && dayRe.test(from)) {
    const [y, m, d] = from.split("-").map(Number);
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      createdAt.gte = new Date(y, m - 1, d, 0, 0, 0, 0);
    }
  }
  if (to && dayRe.test(to)) {
    const [y, m, d] = to.split("-").map(Number);
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      createdAt.lt = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
    }
  }
  if (createdAt.gte || createdAt.lt) where.createdAt = createdAt;

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
