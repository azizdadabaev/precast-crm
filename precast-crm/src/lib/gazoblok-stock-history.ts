/**
 * Gazoblok stock history — Uzbek texts for stock movements and the blocks still
 * promised to open orders («Буюртмаларга керак»). Pure: no Prisma queries, no Date.
 */
import type { GazoblokStockReason } from "@prisma/client";
import { lineQuantities } from "@/lib/gazoblok-quantities";
import { isOpen } from "@/lib/gazoblok-rules";

export const MOVEMENT_REASON_LABELS: Record<GazoblokStockReason, [uz: string, en: string]> = {
  SHIPMENT_LOAD: ["Машина юкланди", "Truck loaded"],
  SHIPMENT_CORRECTION: ["Юк тузатилди", "Load corrected"],
  PRODUCTION: ["Ишлаб чиқарилди", "Produced"],
  MANUAL_ADJUSTMENT: ["Қўлда тузатиш", "Manual adjustment"],
  // Before per-truck stock, delivery wrote the whole order off at once.
  SALE: ["Буюртма етказилди (эски тартиб)", "Order delivered (old rule)"],
  CANCELLATION_RESTOCK: ["Бекор қилинди — омборга қайтди", "Canceled — back to stock"],
};

/** «Машина юкланди · Жўнатма 2 · B-2026-11-0012»; a note is quoted at the end. */
export function movementText(m: {
  reason: GazoblokStockReason;
  note: string | null;
  shipmentNumber: number | null;
  orderNumber: string | null;
}): string {
  const parts = [MOVEMENT_REASON_LABELS[m.reason]?.[0] ?? m.reason];
  if (m.shipmentNumber != null) parts.push(`Жўнатма ${m.shipmentNumber}`);
  if (m.orderNumber) parts.push(m.orderNumber);
  const note = m.note?.trim();
  if (note) parts.push(`«${note}»`);
  return parts.join(" · ");
}

/**
 * Blocks open orders still need, per product: Σ `left` (ordered − loaded, never
 * negative) over open orders. Finished orders and over-loaded lines reserve nothing.
 */
export function reservedByProduct(
  orders: {
    status: string;
    shortClosedAt: Date | null;
    lines: { id: string; productId: string | null; productLabel: string; quantity: number }[];
    shipments: { loadedLines: unknown }[];
  }[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const o of orders) {
    if (!isOpen(o)) continue;
    for (const q of lineQuantities(o.lines, o.shipments)) {
      if (q.productId && q.left > 0) out.set(q.productId, (out.get(q.productId) ?? 0) + q.left);
    }
  }
  return out;
}
