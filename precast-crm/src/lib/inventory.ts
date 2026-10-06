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

/** A truck's recorded counts as inventory lines (beams ascending, blocks last). */
export function shipmentToInventoryLines(loadedBeams: unknown, loadedBlocks: number | null): InventoryLine[] {
  const lines: InventoryLine[] = [];
  if (loadedBeams && typeof loadedBeams === "object" && !Array.isArray(loadedBeams)) {
    const map = new Map<number, number>();
    for (const [k, v] of Object.entries(loadedBeams as Record<string, unknown>)) {
      const len = canonicalBeamLength(k);
      const n = Number(v);
      if (len > 0 && Number.isFinite(n) && n > 0) map.set(len, (map.get(len) ?? 0) + n);
    }
    for (const [len, qty] of Array.from(map.entries()).sort((a, b) => a[0] - b[0])) {
      lines.push({ kind: "BEAM", beamLength: len, quantity: qty });
    }
  }
  const blocks = Number(loadedBlocks ?? 0);
  if (Number.isFinite(blocks) && blocks > 0) lines.push({ kind: "BLOCK", beamLength: null, quantity: blocks });
  return lines;
}

const lineKey = (kind: InventoryKind, len: number | null) =>
  `${kind}:${len == null ? "" : canonicalBeamLength(len)}`;

/**
 * What an order has net taken out of stock: its DELIVERY write-offs minus any
 * CANCELLATION_RESTOCK. Production and manual rows are not the order's.
 */
export function netWrittenOff(
  movements: Array<{ change: number; reason: string; kind: InventoryKind; beamLength: number | null }>,
): InventoryLine[] {
  const net = new Map<string, InventoryLine>();
  for (const m of movements) {
    if (m.reason !== "DELIVERY" && m.reason !== "CANCELLATION_RESTOCK") continue;
    const len = m.kind === "BEAM" && m.beamLength != null ? canonicalBeamLength(m.beamLength) : null;
    const k = lineKey(m.kind, len);
    const cur = net.get(k) ?? { kind: m.kind, beamLength: len, quantity: 0 };
    cur.quantity += -m.change;
    net.set(k, cur);
  }
  return Array.from(net.values()).filter((l) => l.quantity > 0);
}

/** Order lines minus what is already written off, clamped at zero per line. */
export function remainingToWriteOff(orderLines: InventoryLine[], written: InventoryLine[]): InventoryLine[] {
  const done = new Map(written.map((l) => [lineKey(l.kind, l.beamLength), l.quantity]));
  return orderLines
    .map((l) => ({ ...l, quantity: l.quantity - (done.get(lineKey(l.kind, l.beamLength)) ?? 0) }))
    .filter((l) => l.quantity > 0);
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
  /** The truck that carried the goods (per-truck write-off). */
  shipmentId?: string | null;
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
      shipmentId: movement.shipmentId ?? null,
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
  opts?: { shipmentId?: string | null; note?: string | null },
): Promise<NegativeStockWarning[]> {
  const warnings: NegativeStockWarning[] = [];
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    const { inventoryItemId, resultingQuantity } = await applyStockMovement(
      tx,
      line,
      -line.quantity,
      {
        reason: "DELIVERY",
        orderId,
        actorId: actorId ?? null,
        shipmentId: opts?.shipmentId ?? null,
        note: opts?.note ?? null,
      },
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

/** The order's net written-off lines, read from its own movement history. */
export async function netWrittenOffForOrder(tx: TxClient, orderId: string): Promise<InventoryLine[]> {
  const rows = await tx.stockMovement.findMany({
    where: { orderId, reason: { in: ["DELIVERY", "CANCELLATION_RESTOCK"] } },
    select: { change: true, reason: true, inventoryItem: { select: { kind: true, beamLength: true } } },
  });
  return netWrittenOff(
    rows.map((r) => ({
      change: r.change,
      reason: r.reason,
      kind: r.inventoryItem.kind,
      beamLength: r.inventoryItem.beamLength == null ? null : Number(r.inventoryItem.beamLength),
    })),
  );
}

/** One STOCK_WARNING order event per item that went negative. */
export async function logStockWarnings(
  tx: TxClient,
  orderId: string,
  warnings: NegativeStockWarning[],
): Promise<void> {
  for (const w of warnings) {
    await tx.orderEvent.create({
      data: {
        orderId,
        type: "STOCK_WARNING",
        message: `Stock went negative for ${formatInventoryLabel(w.kind, w.beamLength)} (now ${w.resultingQuantity}). Reconcile production log.`,
        payload: w as object,
      },
    });
  }
}

/**
 * Order → DELIVERED: write off only what no truck (or single-truck load)
 * already wrote off (owner rule 2026-10-06). Never twice; an order with no
 * loading record writes off the whole order, exactly as before.
 */
export async function writeOffRemainderOnDelivery(
  tx: TxClient,
  orderId: string,
  calculations: CalcSnapshotRow[],
  actorId?: string | null,
): Promise<void> {
  const written = await netWrittenOffForOrder(tx, orderId);
  const lines = remainingToWriteOff(calcSnapshotToInventoryLines(calculations), written);
  const warnings = await decrementForDelivery(tx, orderId, lines, actorId, {
    note: written.length > 0 ? "Етказилди — юкланмай қолган қолдиқ" : null,
  });
  await logStockWarnings(tx, orderId, warnings);
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
