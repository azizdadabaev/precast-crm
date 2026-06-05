export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { applyGazoblokMovement } from "@/lib/gazoblok-stock";
import { GazoblokStockAdjustSchema } from "@/lib/gazoblok-validation";

/** GET /api/gazoblok/stock — gazoblok.view. Active sizes + current quantity. */
export const GET = withPermission("gazoblok.view", async () => {
  const products = await prisma.gazoblokProduct.findMany({
    where: { active: true },
    orderBy: [{ seq: "asc" }, { createdAt: "asc" }],
    include: { stock: true },
  });
  return ok(products);
});

/** POST /api/gazoblok/stock — gazoblok.production. Manual signed adjustment. */
export const POST = withPermission("gazoblok.production", async (req: NextRequest, { user }) => {
  const body = GazoblokStockAdjustSchema.parse(await req.json());
  const result = await prisma.$transaction((tx) =>
    applyGazoblokMovement(tx, body.productId, body.change, {
      reason: "MANUAL_ADJUSTMENT",
      actorId: user.id,
      note: body.note ?? null,
    }),
  );
  recordAudit({
    userId: user.id,
    action: "gazoblok.stock.adjust",
    targetType: "gazoblok_product",
    targetId: body.productId,
    message: `Stock ${body.change >= 0 ? "+" : ""}${body.change}`,
    metadata: { resultingQuantity: result.resultingQuantity },
  });
  return ok(result);
});
