export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { DiscrepancyUpdateSchema } from "@/lib/validation";
import { ok, fail, handler } from "@/lib/api";
import { getCurrentUser, hasRole } from "@/lib/auth";

/**
 * PATCH /api/discrepancies/[id]   (ADMIN | OWNER only)
 *
 * Move a discrepancy through its lifecycle:
 *   OPEN → RESOLVED_RECOVERED   (customer paid the rest later)
 *   OPEN → RESOLVED_DISCOUNT    (owner approved as a discount)
 *   OPEN → RESOLVED_WRITEOFF    (owner wrote off as a loss)
 *   OPEN → DISPUTED             (HR / disciplinary process)
 *   any  → OPEN                 (re-open if more info comes in)
 *
 * resolutionNote is required (min 5 chars) so the audit trail captures
 * why each transition happened.
 */
export const PATCH = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN", "OWNER")) {
    return fail("Only ADMIN or OWNER can resolve discrepancies", 403);
  }
  const actor = await prisma.user.findUnique({
    where: { id: user!.sub },
    select: { id: true },
  });
  if (!actor) {
    return fail("Your session is stale — please log out and log back in.", 401);
  }

  const body = DiscrepancyUpdateSchema.parse(await req.json());
  const existing = await prisma.discrepancy.findUnique({
    where: { id: ctx.params.id },
  });
  if (!existing) return fail("Discrepancy not found", 404);

  const isResolving = body.status !== "OPEN";
  const updated = await prisma.$transaction(async (tx) => {
    const d = await tx.discrepancy.update({
      where: { id: existing.id },
      data: {
        status: body.status,
        resolutionNote: body.resolutionNote.trim(),
        resolvedById: isResolving ? actor.id : null,
        resolvedAt: isResolving ? new Date() : null,
      },
    });
    await tx.orderEvent.create({
      data: {
        orderId: existing.orderId,
        type: "DISCREPANCY_RESOLVED",
        actorId: actor.id,
        message: `Discrepancy ${existing.id.slice(-6)}: ${existing.status} → ${body.status}`,
        payload: {
          discrepancyId: existing.id,
          from: existing.status,
          to: body.status,
          note: body.resolutionNote,
        },
      },
    });
    return d;
  });

  return ok(updated);
});
