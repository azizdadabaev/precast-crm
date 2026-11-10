/**
 * Gazoblok order rules (Stage 1 renovation). Each returns the reason an action
 * is refused, in the API's "Узбекча · English" style, or null when allowed.
 */
import { formatNumber } from "@/lib/utils";
import type { LineQty } from "./gazoblok-quantities";

/**
 * DELIVERED needs: every size loaded at least as ordered (or the order was closed
 * short), every truck delivered, and full payment (owner rule 2026-07-23).
 */
export function canDeliver(o: { lines: LineQty[]; shortClosed: boolean; openShipments: number; remaining: number }): string | null {
  const totalLoaded = o.lines.reduce((s, l) => s + l.loaded, 0);
  if (!o.shortClosed && (totalLoaded === 0 || o.lines.some((l) => l.left > 0))) {
    return "Ҳамма блоклар юкланмаган — юкланг ёки буюртмани қисқа ёпинг · Not everything is loaded — load it or close the order short";
  }
  if (o.openShipments > 0) return "Аввал барча жўнатмаларни етказинг · Deliver all shipments first";
  if (o.remaining > 0.005) {
    return "Тўлиқ тўланмаган буюртмани етказиб бўлмайди — аввал тўловни тасдиқланг · Order must be fully paid before delivery";
  }
  return null;
}

/** Cancel only while nothing has left the yard; after a load the order is closed short instead. */
export function canCancel(o: { totalLoaded: number }): string | null {
  if (o.totalLoaded > 0) {
    return "Блоклар юкланган — бекор қилиб бўлмайди, буюртмани қисқа ёпинг · Blocks were loaded — close the order short instead of cancelling";
  }
  return null;
}

export function paymentCeilingProblem(amount: number, remaining: number): string | null {
  if (amount > remaining + 0.005) {
    const r = formatNumber(Math.max(0, remaining), 2);
    return `Сумма қолдиқдан ошиб кетди (қолдиқ ${r} UZS) · Amount exceeds remaining balance (${r} UZS)`;
  }
  return null;
}

/** Trucks can be loaded or corrected only while the order is open. */
export function isOpen(o: { status: string; shortClosedAt: Date | string | null }): boolean {
  return (o.status === "PLACED" || o.status === "IN_PRODUCTION") && !o.shortClosedAt;
}
