export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, handler } from "@/lib/api";
import { getCurrentUser, hasRole } from "@/lib/auth";

/**
 * PATCH /api/drivers/[id]/deactivate   (ADMIN | OWNER only)
 *
 * Soft-disable: sets active=false. Deactivated drivers don't appear in
 * the dispatch dropdown. Existing dispatches and discrepancies remain
 * for audit. To re-enable, this endpoint also handles { active: true }
 * via a body flag — keeping the URL stable.
 */
export const PATCH = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const user = await getCurrentUser();
  if (!hasRole(user, "ADMIN", "OWNER")) {
    return fail("Only ADMIN or OWNER can deactivate drivers", 403);
  }
  const body = (await req.json().catch(() => ({}))) as { active?: boolean };
  const active = body.active === true; // explicit re-activation; default = deactivate

  const driver = await prisma.driver.update({
    where: { id: ctx.params.id },
    data: { active },
  });
  return ok(driver);
});
