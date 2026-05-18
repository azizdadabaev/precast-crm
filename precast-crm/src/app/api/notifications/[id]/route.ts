export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";

/** PATCH /api/notifications/[id] — mark a single notification read. */
export const PATCH = withAuth<{ id: string }>(
  async (_req: NextRequest, { user, params }) => {
    await prisma.notification.updateMany({
      where: { id: params.id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return ok({ ok: true });
  },
);
