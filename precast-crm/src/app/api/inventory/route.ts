export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * GET /api/inventory — inventory.view
 *
 * Returns every InventoryItem with its 5 most recent StockMovements
 * (for the inventory page's per-row history strip). Beams sorted by
 * length ascending, BLOCK item last.
 */
export const GET = withPermission("inventory.view", async () => {
  const items = await prisma.inventoryItem.findMany({
    orderBy: [{ kind: "asc" }, { beamLength: "asc" }],
    include: {
      movements: {
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          order: { select: { id: true, orderNumber: true } },
          actor: { select: { id: true, name: true } },
        },
      },
    },
  });
  return ok(items);
});
