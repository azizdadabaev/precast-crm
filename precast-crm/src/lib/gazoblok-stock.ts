/**
 * Газоблок stock ledger — mirrors src/lib/inventory.ts but keyed by a
 * catalog product (GazoblokProduct) instead of (kind, beamLength). Every
 * increment/decrement updates the one-to-one GazoblokStock row and appends
 * an append-only GazoblokStockMovement. Call these from inside a
 * prisma.$transaction() so the quantity update + ledger row are atomic.
 *
 * Negative stock is allowed (mirrors the floor inventory rule) so a
 * delivery is never blocked by an under-recorded production log — callers
 * surface the returned warnings instead.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

type TxClient = Prisma.TransactionClient | PrismaClient;

export type GazoblokStockReason =
  | "PRODUCTION"
  | "SALE"
  | "MANUAL_ADJUSTMENT"
  | "CANCELLATION_RESTOCK";

interface MovementMeta {
  reason: GazoblokStockReason;
  productionEntryId?: string | null;
  orderId?: string | null;
  actorId?: string | null;
  note?: string | null;
}

/**
 * Apply one signed movement to a product's stock (creating the GazoblokStock
 * row on first touch) and append the ledger entry. Returns the resulting
 * quantity so callers can detect underflow.
 */
export async function applyGazoblokMovement(
  tx: TxClient,
  productId: string,
  change: number,
  meta: MovementMeta,
): Promise<{ resultingQuantity: number }> {
  let stock = await tx.gazoblokStock.findUnique({ where: { productId } });
  if (!stock) {
    stock = await tx.gazoblokStock.create({ data: { productId, quantity: change } });
  } else if (change !== 0) {
    stock = await tx.gazoblokStock.update({
      where: { productId },
      data: { quantity: { increment: change } },
    });
  }

  await tx.gazoblokStockMovement.create({
    data: {
      productId,
      change,
      resultingQuantity: stock.quantity,
      reason: meta.reason,
      productionEntryId: meta.productionEntryId ?? null,
      orderId: meta.orderId ?? null,
      actorId: meta.actorId ?? null,
      note: meta.note ?? null,
    },
  });

  return { resultingQuantity: stock.quantity };
}

export interface NegativeStockWarning {
  productId: string;
  resultingQuantity: number;
  decrementedBy: number;
}

export interface OrderLineMovement {
  productId: string | null;
  quantity: number;
}

/** Decrement stock for every line of a delivered order. Lines whose product
 *  was deleted (productId null) are skipped. Returns any negatives hit. */
export async function decrementGazoblokForOrder(
  tx: TxClient,
  orderId: string,
  lines: OrderLineMovement[],
  actorId?: string | null,
): Promise<NegativeStockWarning[]> {
  const warnings: NegativeStockWarning[] = [];
  for (const l of lines) {
    if (!l.productId || l.quantity <= 0) continue;
    const { resultingQuantity } = await applyGazoblokMovement(tx, l.productId, -l.quantity, {
      reason: "SALE",
      orderId,
      actorId: actorId ?? null,
    });
    if (resultingQuantity < 0) {
      warnings.push({ productId: l.productId, resultingQuantity, decrementedBy: l.quantity });
    }
  }
  return warnings;
}

/** Mirror image — restock when a previously-delivered order is canceled. */
export async function restockGazoblokForCancellation(
  tx: TxClient,
  orderId: string,
  lines: OrderLineMovement[],
  actorId?: string | null,
  note?: string | null,
): Promise<void> {
  for (const l of lines) {
    if (!l.productId || l.quantity <= 0) continue;
    await applyGazoblokMovement(tx, l.productId, l.quantity, {
      reason: "CANCELLATION_RESTOCK",
      orderId,
      actorId: actorId ?? null,
      note: note ?? null,
    });
  }
}
