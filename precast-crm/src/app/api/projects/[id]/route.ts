export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { deleteProjectCascade } from "@/lib/record-delete";

type Params = { id: string };

/**
 * DELETE /api/projects/[id] — project.delete (owner-only).
 * Removes a saved project together with its calculations and its order
 * (if one was placed). For clearing test data.
 */
export const DELETE = withPermission<Params>(
  "project.delete",
  async (_req: NextRequest, { params, user }) => {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        draftNumber: true,
        orders: { select: { orderNumber: true }, take: 1 },
      },
    });
    if (!project) return fail("Лойиҳа топилмади · Project not found", 404);

    await prisma.$transaction((tx) => deleteProjectCascade(tx, project.id));

    const label =
      project.name ?? (project.draftNumber ? `${project.draftNumber}D` : project.id);
    const orderNote = project.orders[0]
      ? ` (+ order ${project.orders[0].orderNumber})`
      : "";
    recordAudit({
      userId: user.id,
      action: "project.delete",
      targetType: "project",
      targetId: project.id,
      message: `Deleted project ${label}${orderNote}`,
      metadata: {
        projectId: project.id,
        orderNumber: project.orders[0]?.orderNumber,
      },
    });
    return ok({ deleted: true });
  },
);
