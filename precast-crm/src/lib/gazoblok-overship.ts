// Pure over-shipment surcharge math for gazoblok orders.
//
// Customers routinely take MORE blocks than they ordered. The order lines
// (quantity, unitPrice, lineTotal) stay frozen; the extra blocks are captured
// as one explicit surcharge that raises the payable total. Over-shipped blocks
// bill at the line's FROZEN placement `unitPrice`.
//
// Pricing identity (see the order-totals.ts style — no Prisma, no Date, no env):
//   overshipAmount = Σ_line  max(0, shippedQty(line) − line.quantity) × unitPrice
//   shippedQty(line) = Σ over all shipments of loadedLines[line.id]

import { round2 } from "@/services/calculation-engine";

/** One frozen order line, as the surcharge math sees it. */
export interface OvershipLine {
  id: string;
  quantity: number; // ordered blocks (frozen)
  unitPrice: number; // per-block price at placement (Number() a Prisma Decimal)
}

/** One shipment's per-line loaded block counts (the `loadedLines` JSON). */
export interface OvershipShipment {
  loadedLines: Record<string, number> | null;
}

export interface OvershipResult {
  /** lineId → blocks shipped BEYOND the ordered quantity (≥ 0). */
  perLine: Map<string, number>;
  /** Σ over-count × unitPrice, rounded to 2dp. */
  overshipAmount: number;
}

/**
 * Recompute the over-shipment surcharge from the order's frozen lines and the
 * `loadedLines` of ALL its shipments. A shipment carrying a line that is not
 * over-ordered (or a line not on the order at all) contributes 0.
 */
export function computeOvership(
  lines: OvershipLine[],
  shipments: OvershipShipment[],
): OvershipResult {
  // Σ shipped per line across ALL shipments.
  const shipped = new Map<string, number>();
  for (const s of shipments) {
    const loaded = s.loadedLines ?? {};
    for (const [lineId, count] of Object.entries(loaded)) {
      shipped.set(lineId, (shipped.get(lineId) ?? 0) + Number(count));
    }
  }

  const perLine = new Map<string, number>();
  let overshipAmount = 0;
  for (const l of lines) {
    const over = Math.max(0, (shipped.get(l.id) ?? 0) - l.quantity);
    perLine.set(l.id, over);
    overshipAmount += over * Number(l.unitPrice);
  }

  return { perLine, overshipAmount: round2(overshipAmount) };
}
