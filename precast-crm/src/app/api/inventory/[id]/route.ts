export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { InventoryUpdateSchema } from "@/lib/validation";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/** PATCH /api/inventory/[id] — inventory.manage. Currently only updates lowStockThreshold. */
export const PATCH = withPermission<{ id: string }>(
  "inventory.manage",
  async (req: NextRequest, { params }) => {
    const body = InventoryUpdateSchema.parse(await req.json());
    if (Object.keys(body).length === 0) return fail("Nothing to update", 422);

    const item = await prisma.inventoryItem.update({
      where: { id: params.id },
      data: body,
    });
    return ok(item);
  },
);
