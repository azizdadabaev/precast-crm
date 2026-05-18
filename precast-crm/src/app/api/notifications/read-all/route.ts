export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";

/** POST /api/notifications/read-all — mark all unread notifications read. */
export const POST = withAuth(async (_req: NextRequest, { user }) => {
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return ok({ ok: true });
});
