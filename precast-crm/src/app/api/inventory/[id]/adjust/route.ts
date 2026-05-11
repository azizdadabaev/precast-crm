export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { InventoryAdjustmentSchema } from "@/lib/validation";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * POST /api/inventory/[id]/adjust — inventory.manage
 *
 * Manual adjustment. Records a StockMovement with reason
 * MANUAL_ADJUSTMENT and the operator's note (required). Allows the
 * resulting quantity to go negative — manual adjustments are the
 * mechanism for reconciling negative stock back up.
 */
export const POST = withPermission<{ id: string }>(
  "inventory.manage",
  async (req: NextRequest, { user, params }) => {
    const body = InventoryAdjustmentSchema.parse(await req.json());

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.inventoryItem.findUnique({
        where: { id: params.id },
      });
      if (!existing) throw new Error("ITEM_NOT_FOUND");

      const item = await tx.inventoryItem.update({
        where: { id: existing.id },
        data: { quantity: { increment: body.delta } },
      });

      await tx.stockMovement.create({
        data: {
          inventoryItemId: item.id,
          change: body.delta,
          resultingQuantity: item.quantity,
          reason: "MANUAL_ADJUSTMENT",
          actorId: user.id,
          note: body.note,
        },
      });
      return item;
    });

    return ok(updated);
  },
);
