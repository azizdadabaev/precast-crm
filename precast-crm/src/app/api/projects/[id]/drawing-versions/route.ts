export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * GET /api/projects/[id]/drawing-versions — order.view.
 * The append-only version timeline for a project's floor plan, newest first.
 * Captured automatically on each Save (before the calculations are
 * deleted-and-recreated), so a prior quote is never lost on an edit.
 */
export const GET = withPermission<{ id: string }>(
  "order.view",
  async (_req: NextRequest, { params }) => {
    const versions = await prisma.drawingVersion.findMany({
      where: { projectId: params.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return ok(versions);
  },
);
