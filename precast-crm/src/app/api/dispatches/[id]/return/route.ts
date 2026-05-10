export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * PATCH /api/dispatches/[id]/return — dispatch.create
 *
 * Marks the dispatch as returned (driver back at office). Used when the
 * delivery flow's "Driver returned" toggle was left unchecked, OR when
 * the truck came back without delivering. Idempotent — re-calling on a
 * already-returned dispatch is a no-op.
 *
 * Permission: dispatch.create — same operators who schedule trucks
 * mark them returned.
 */
export const PATCH = withPermission<{ id: string }>(
  "dispatch.create",
  async (_req: NextRequest, { user, params }) => {
    const dispatch = await prisma.dispatch.findUnique({
      where: { id: params.id },
    });
    if (!dispatch) return fail("Dispatch not found", 404);
    if (dispatch.returnedAt) return ok(dispatch);

    const updated = await prisma.$transaction(async (tx) => {
      const d = await tx.dispatch.update({
        where: { id: dispatch.id },
        data: { returnedAt: new Date() },
      });
      await tx.orderEvent.create({
        data: {
          orderId: dispatch.orderId,
          type: "DISPATCH_RETURNED",
          actorId: user.id,
          message: "Driver returned to office",
          payload: { dispatchId: dispatch.id },
        },
      });
      return d;
    });

    return ok(updated);
  },
);
