export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * PATCH /api/drivers/[id]/deactivate — driver.manage
 *
 * Soft-disable: sets active=false. Deactivated drivers don't appear in
 * the dispatch dropdown. Existing dispatches and discrepancies remain
 * for audit. To re-enable, this endpoint also handles { active: true }
 * via a body flag — keeping the URL stable.
 */
export const PATCH = withPermission<{ id: string }>(
  "driver.manage",
  async (req: NextRequest, { params }) => {
    const body = (await req.json().catch(() => ({}))) as { active?: boolean };
    const active = body.active === true; // explicit re-activation; default = deactivate

    const driver = await prisma.driver.update({
      where: { id: params.id },
      data: { active },
    });
    return ok(driver);
  },
);
