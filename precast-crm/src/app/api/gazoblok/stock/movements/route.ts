export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { parseMovementQuery, pageOf } from "@/lib/gazoblok-stock-movements";

/** GET /api/gazoblok/stock/movements — `inventory.view`, read-only (spec §6).
 *  Query: productId?, reason? (enum), cursor? (movement id), limit? (50, max 200).
 *  → { items, nextCursor }, newest first. */
export const GET = withPermission("inventory.view", async (req: NextRequest) => {
  const q = parseMovementQuery(new URL(req.url).searchParams);
  const rows = await prisma.gazoblokStockMovement.findMany({
    where: {
      ...(q.productId ? { productId: q.productId } : {}),
      ...(q.reason ? { reason: q.reason } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: q.limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    include: {
      product: { select: { label: true } },
      actor: { select: { id: true, name: true } },
      order: { select: { id: true, orderNumber: true } },
    },
  });
  const { items, nextCursor } = pageOf(rows, q.limit);

  // No shipment relation on movements — look the truck numbers up in one query.
  const shipmentIds = Array.from(new Set(items.flatMap((m) => (m.shipmentId ? [m.shipmentId] : []))));
  const shipments = shipmentIds.length
    ? await prisma.gazoblokShipment.findMany({ where: { id: { in: shipmentIds } }, select: { id: true, number: true } })
    : [];
  const numberOf = new Map(shipments.map((s) => [s.id, s.number]));

  return ok({
    items: items.map((m) => ({
      id: m.id,
      createdAt: m.createdAt,
      productId: m.productId,
      productLabel: m.product.label,
      change: m.change,
      resultingQuantity: m.resultingQuantity,
      reason: m.reason,
      note: m.note,
      actor: m.actor,
      order: m.order,
      shipmentNumber: m.shipmentId ? numberOf.get(m.shipmentId) ?? null : null,
      productionEntryId: m.productionEntryId,
    })),
    nextCursor,
  });
});
