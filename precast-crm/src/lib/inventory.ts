/**
 * Inventory module — pure helpers + DB operations.
 *
 * The PURE section (top half) is unit-testable without a database. It owns
 * the math: how a calculation snapshot becomes a list of stock movements.
 * The DB section (bottom half) wraps Prisma transactions — increment/
 * decrement an InventoryItem and append a StockMovement in one shot.
 */

import type { Prisma, PrismaClient } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────
// PURE HELPERS
// ─────────────────────────────────────────────────────────────────

export type InventoryKind = "BEAM" | "BLOCK";

export interface InventoryLine {
  kind: InventoryKind;
  /** For BEAM: meters rounded to 2 decimals (e.g. 4.30). For BLOCK: null. */
  beamLength: number | null;
  quantity: number;
}

/**
 * Canonical lookup key for InventoryItem.beamLength: meters rounded to 2
 * decimals. The schema column is Decimal(10, 2); we keep the in-memory
 * representation aligned so equality checks are stable.
 */
export function canonicalBeamLength(meters: number | string): number {
  const n = typeof meters === "string" ? Number(meters) : meters;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

interface CalcSnapshotRow {
  beamLength: string | number | Prisma.Decimal;
  beamCount: number;
  totalBlocks: number;
}

/**
 * Collapse a project's calculations into the discrete inventory lines
 * that production / delivery / restock operations consume.
 *
 * Rules:
 *   - All beams of the same canonical length collapse into one BEAM line.
 *   - All blocks across rooms accumulate into a single BLOCK line.
 *   - Lines with quantity = 0 are dropped (nothing to move).
 *
 * The output is sorted: beams ascending by length, blocks last. This is
 * just for stable DB writes / test snapshots; consumers shouldn't depend
 * on order for correctness.
 */
export function calcSnapshotToInventoryLines(rows: CalcSnapshotRow[]): InventoryLine[] {
  const beamMap = new Map<number, number>();
  let blockTotal = 0;

  for (const r of rows) {
    const len = canonicalBeamLength(r.beamLength as number | string);
    if (len > 0 && r.beamCount > 0) {
      beamMap.set(len, (beamMap.get(len) ?? 0) + r.beamCount);
    }
    if (r.totalBlocks > 0) blockTotal += r.totalBlocks;
  }

  const lines: InventoryLine[] = [];
  for (const [len, qty] of Array.from(beamMap.entries()).sort((a, b) => a[0] - b[0])) {
    lines.push({ kind: "BEAM", beamLength: len, quantity: qty });
  }
  if (blockTotal > 0) lines.push({ kind: "BLOCK", beamLength: null, quantity: blockTotal });
  return lines;
}

/** Tier label for the stock view's color rule. */
export type StockTier = "ok" | "low" | "critical";

export function stockTier(quantity: number, threshold: number): StockTier {
  if (quantity <= threshold) return "critical";
  if (quantity <= threshold * 1.5) return "low";
  return "ok";
}

// ─────────────────────────────────────────────────────────────────
// DB OPERATIONS — call these from inside a prisma.$transaction()
// ─────────────────────────────────────────────────────────────────

type TxClient = Prisma.TransactionClient | PrismaClient;

interface MovementInputBase {
  reason: "PRODUCTION" | "DELIVERY" | "MANUAL_ADJUSTMENT" | "CANCELLATION_RESTOCK";
  productionEntryId?: string | null;
  orderId?: string | null;
  actorId?: string | null;
  note?: string | null;
}

/**
 * Apply a single stock movement to the matching InventoryItem (creating
 * the row if it doesn't exist yet for this kind+length pair). Returns the
 * new resulting quantity so callers can detect underflow.
 *
 * `change` is signed: positive for production / restock, negative for
 * delivery / negative manual adjustments.
 */
export async function applyStockMovement(
  tx: TxClient,
  line: InventoryLine,
  change: number,
  movement: MovementInputBase,
): Promise<{ inventoryItemId: string; resultingQuantity: number }> {
  // Use findFirst + create/update rather than upsert because Prisma's
  // composite-unique upsert is brittle when one of the keys is a Decimal
  // column (it intermittently throws P2025 even when the row exists).
  // The surrounding $transaction makes this race-safe at the row level.
  let item = await tx.inventoryItem.findFirst({
    where: {
      kind: line.kind,
      // For BLOCK rows we look up the single row where beamLength IS NULL.
      // Prisma serializes `null` here as `IS NULL` which is what we want.
      beamLength: line.beamLength ?? null,
    },
  });

  if (!item) {
    item = await tx.inventoryItem.create({
      data: {
        kind: line.kind,
        beamLength: line.beamLength ?? null,
        quantity: change, // initial value
      },
    });
  } else if (change !== 0) {
    item = await tx.inventoryItem.update({
      where: { id: item.id },
      data: { quantity: { increment: change } },
    });
  }

  await tx.stockMovement.create({
    data: {
      inventoryItemId: item.id,
      change,
      resultingQuantity: item.quantity,
      reason: movement.reason,
      productionEntryId: movement.productionEntryId ?? null,
      orderId: movement.orderId ?? null,
      actorId: movement.actorId ?? null,
      note: movement.note ?? null,
    },
  });

  return { inventoryItemId: item.id, resultingQuantity: item.quantity };
}

/**
 * Convenience wrapper: decrement stock for every line of a delivered
 * order's calculation snapshot. Returns the list of items that went
 * negative — the caller logs a STOCK_WARNING OrderEvent per occurrence
 * and surfaces a banner on the order page.
 */
export interface NegativeStockWarning {
  inventoryItemId: string;
  kind: InventoryKind;
  beamLength: number | null;
  resultingQuantity: number;
  decrementedBy: number;
}

export async function decrementForDelivery(
  tx: TxClient,
  orderId: string,
  lines: InventoryLine[],
  actorId?: string | null,
): Promise<NegativeStockWarning[]> {
  const warnings: NegativeStockWarning[] = [];
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    const { inventoryItemId, resultingQuantity } = await applyStockMovement(
      tx,
      line,
      -line.quantity,
      { reason: "DELIVERY", orderId, actorId: actorId ?? null },
    );
    if (resultingQuantity < 0) {
      warnings.push({
        inventoryItemId,
        kind: line.kind,
        beamLength: line.beamLength,
        resultingQuantity,
        decrementedBy: line.quantity,
      });
    }
  }
  return warnings;
}

/** Mirror image — restock everything when a previously-delivered order is canceled. */
export async function restockForCancellation(
  tx: TxClient,
  orderId: string,
  lines: InventoryLine[],
  actorId?: string | null,
  note?: string | null,
): Promise<void> {
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    await applyStockMovement(
      tx,
      line,
      line.quantity,
      {
        reason: "CANCELLATION_RESTOCK",
        orderId,
        actorId: actorId ?? null,
        note: note ?? null,
      },
    );
  }
}

/** Format a beam length / block label for UI use. */
export function formatInventoryLabel(kind: InventoryKind, beamLength: number | null): string {
  if (kind === "BLOCK") return "Ғишт · Block";
  return `Балка ${beamLength?.toFixed(2) ?? "?"} m`;
}
