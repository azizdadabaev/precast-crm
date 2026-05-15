export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * GET /api/projects/[id]/status — order.view.
 *
 * Tiny endpoint the calculator page uses to self-heal a stale
 * `draftProjectId` in its persisted localStorage. If the project
 * the calculator references is no longer a DRAFT (it was already
 * placed as an order, archived, or deleted), the calculator clears
 * itself so the operator can't try to place the same draft twice.
 *
 * Returns null (not 404) when the project doesn't exist — the
 * client uses null vs object to decide whether to wipe the store.
 */
export const GET = withPermission(
  "order.view",
  async (_req, { params }: { params: { id: string } }) => {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      select: { status: true },
    });
    return ok(project ?? null);
  },
);
