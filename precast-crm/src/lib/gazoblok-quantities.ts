/**
 * Gazoblok quantities — the strict per-size picture the owner asked for:
 * ordered (frozen at placement), loaded (Σ trucks), left, over.
 * "kept strict on how many loaded, how many left, how many ordered" — owner, 2026-11-10.
 * Pure: no Prisma, no Date.
 */
import { round2 } from "@/services/calculation-engine";

export type LineQty = {
  lineId: string;
  productId: string | null;
  label: string;
  ordered: number;
  loaded: number;
  left: number;
  over: number;
};

type QtyLine = { id: string; productId: string | null; productLabel: string; quantity: number };
type PricedLine = { id: string; quantity: number; unitPrice: number };
type ShipmentLoad = { loadedLines: unknown };

function loadsOf(s: ShipmentLoad): Record<string, number> {
  const raw = s.loadedLines;
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, Number(v) || 0]));
}

/** Σ loaded blocks per order-line id across shipments. */
export function loadedByLine(shipments: ShipmentLoad[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of shipments) for (const [k, v] of Object.entries(loadsOf(s))) m.set(k, (m.get(k) ?? 0) + v);
  return m;
}

/** Per line: ordered / loaded / left / over. Loads keyed to ids not on the order are ignored. */
export function lineQuantities(lines: QtyLine[], shipments: ShipmentLoad[]): LineQty[] {
  const loaded = loadedByLine(shipments);
  return lines.map((l) => {
    const got = loaded.get(l.id) ?? 0;
    return {
      lineId: l.id,
      productId: l.productId,
      label: l.productLabel,
      ordered: l.quantity,
      loaded: got,
      left: Math.max(0, l.quantity - got),
      over: Math.max(0, got - l.quantity),
    };
  });
}

/** Per-line change a re-load (correction) makes: next − prev, non-zero entries only. */
export function loadDelta(prev: Record<string, number> | null, next: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  const keys = new Set([...Object.keys(prev ?? {}), ...Object.keys(next)]);
  for (const k of keys) {
    const d = (next[k] ?? 0) - (prev?.[k] ?? 0);
    if (d !== 0) out[k] = d;
  }
  return out;
}

/** Lines that would exceed their ordered quantity after this load (other trucks + this one). */
export function overloadLines(
  lines: { id: string; quantity: number }[],
  otherShipments: ShipmentLoad[],
  nextLoaded: Record<string, number>,
): { lineId: string; extra: number }[] {
  const others = loadedByLine(otherShipments);
  const out: { lineId: string; extra: number }[] = [];
  for (const l of lines) {
    const total = (others.get(l.id) ?? 0) + (nextLoaded[l.id] ?? 0);
    const prevOver = Math.max(0, (others.get(l.id) ?? 0) - l.quantity);
    const over = Math.max(0, total - l.quantity);
    if (over > prevOver) out.push({ lineId: l.id, extra: over - prevOver });
  }
  return out;
}

/**
 * The part of the over-load surcharge still unpaid. Payments cover the ordered
 * blocks first, so the extra is the last money in — exactly what the selling
 * operator still has to account for.
 */
export function unpaidOverload(o: { overshipAmount: number; totalPrice: number; confirmedPaid: number }): number {
  const owed = Math.max(0, Number(o.totalPrice) - Number(o.confirmedPaid));
  return round2(Math.min(Number(o.overshipAmount), owed));
}

/**
 * Close short: bill the blocks that were actually loaded. Lines at loaded × unitPrice
 * (over-loaded lines bill at loaded too, so no separate surcharge), discount scaled
 * to the new subtotal, delivery unchanged.
 */
export function shortCloseTotals(
  lines: PricedLine[],
  loaded: Map<string, number>,
  o: { linesSubtotal: number; discountAmount: number; deliveryCost: number },
): { linesSubtotal: number; discountAmount: number; totalPrice: number } {
  const linesSubtotal = round2(lines.reduce((s, l) => s + (loaded.get(l.id) ?? 0) * Number(l.unitPrice), 0));
  const oldSub = Number(o.linesSubtotal);
  const discountAmount = oldSub > 0 ? round2((Number(o.discountAmount) * linesSubtotal) / oldSub) : 0;
  const totalPrice = round2(linesSubtotal - discountAmount + Number(o.deliveryCost));
  return { linesSubtotal, discountAmount, totalPrice };
}

/** "7,5" / "7.5" / " 7 " → number; anything else → null. Operators type a decimal comma. */
export function parseDecimal(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}
