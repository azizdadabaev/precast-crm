export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { InventoryUpdateSchema } from "@/lib/validation";
import { ok, fail, handler } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

/** PATCH /api/inventory/[id] — currently only updates lowStockThreshold. ADMIN only. */
export const PATCH = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") {
    return fail("Only ADMIN can update inventory thresholds", 403);
  }

  const body = InventoryUpdateSchema.parse(await req.json());
  if (Object.keys(body).length === 0) return fail("Nothing to update", 422);

  const item = await prisma.inventoryItem.update({
    where: { id: ctx.params.id },
    data: body,
  });
  return ok(item);
});
