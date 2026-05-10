export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { InventoryAdjustmentSchema } from "@/lib/validation";
import { ok, fail, handler } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

/**
 * POST /api/inventory/[id]/adjust
 *
 * ADMIN-only manual adjustment. Records a StockMovement with reason
 * MANUAL_ADJUSTMENT and the operator's note (required). Allows the
 * resulting quantity to go negative — manual adjustments are the
 * mechanism for reconciling negative stock back up.
 */
export const POST = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const user = await getCurrentUser();
  if (user?.role !== "ADMIN") {
    return fail("Only ADMIN can manually adjust stock", 403);
  }

  const body = InventoryAdjustmentSchema.parse(await req.json());

  const actorId = user?.sub
    ? (await prisma.user.findUnique({ where: { id: user.sub }, select: { id: true } }))?.id ?? null
    : null;

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.inventoryItem.findUnique({ where: { id: ctx.params.id } });
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
        actorId,
        note: body.note,
      },
    });
    return item;
  });

  return ok(updated);
});
