export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, handler } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

/**
 * PATCH /api/dispatches/[id]/return   (any authenticated role)
 *
 * Marks the dispatch as returned (driver back at office). Used when the
 * delivery flow's "Driver returned" toggle was left unchecked, OR when
 * the truck came back without delivering. Idempotent — re-calling on a
 * already-returned dispatch is a no-op.
 */
export const PATCH = handler(async (_req: NextRequest, ctx: { params: { id: string } }) => {
  const user = await getCurrentUser();
  if (!user) return fail("Unauthorized", 401);
  const actor = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { id: true },
  });
  if (!actor) {
    return fail("Your session is stale — please log out and log back in.", 401);
  }

  const dispatch = await prisma.dispatch.findUnique({
    where: { id: ctx.params.id },
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
        actorId: actor.id,
        message: "Driver returned to office",
        payload: { dispatchId: dispatch.id },
      },
    });
    return d;
  });

  return ok(updated);
});
