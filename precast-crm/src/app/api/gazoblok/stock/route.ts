export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { applyGazoblokMovement } from "@/lib/gazoblok-stock";
import { GazoblokStockAdjustSchema } from "@/lib/gazoblok-validation";
import { reservedByProduct } from "@/lib/gazoblok-stock-history";

/** GET /api/gazoblok/stock — `inventory.view`. Active sizes + current quantity +
 *  `reserved`: blocks open orders still need (ordered − loaded, spec §6). */
export const GET = withPermission("inventory.view", async () => {
  const [products, openOrders] = await Promise.all([
    prisma.gazoblokProduct.findMany({
      where: { active: true },
      orderBy: [{ seq: "asc" }, { createdAt: "asc" }],
      include: { stock: true },
    }),
    prisma.gazoblokOrder.findMany({
      where: { status: { in: ["PLACED", "IN_PRODUCTION"] }, shortClosedAt: null },
      select: {
        status: true,
        shortClosedAt: true,
        lines: { select: { id: true, productId: true, productLabel: true, quantity: true } },
        shipments: { select: { loadedLines: true } },
      },
    }),
  ]);
  const reserved = reservedByProduct(openOrders);
  return ok(products.map((p) => ({ ...p, reserved: reserved.get(p.id) ?? 0 })));
});

/** POST /api/gazoblok/stock — `inventory.manage`. Manual signed adjustment. */
export const POST = withPermission("inventory.manage", async (req: NextRequest, { user }) => {
  const body = GazoblokStockAdjustSchema.parse(await req.json());
  const product = await prisma.gazoblokProduct.findUnique({
    where: { id: body.productId },
    select: { id: true },
  });
  if (!product) {
    return fail("Маҳсулот топилмади · Product not found", 422);
  }
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
