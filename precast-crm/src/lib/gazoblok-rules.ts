/**
 * Gazoblok order rules (Stage 1 renovation). Each returns the reason an action
 * is refused, in the API's "Узбекча · English" style, or null when allowed.
 */
import { formatNumber } from "@/lib/utils";
import { lineQuantities, shortCloseTotals, type LineQty } from "./gazoblok-quantities";
import { round2 } from "@/services/calculation-engine";

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

type Refusal = { status: number; message: string };

/**
 * Money may be recorded on any order that isn't cancelled: a closed-short order
 * can still owe its loaded part, and the ceiling check stops over-payment.
 */
export function recordPaymentProblem(o: { status: string }): Refusal | null {
  if (o.status === "CANCELED") {
    return { status: 422, message: "Бекор қилинган буюртмага тўлов ёзиб бўлмайди · Cannot record payment on a canceled order" };
  }
  return null;
}

/** A pending payment on a cancelled order can only be rejected — confirming would count money on a dead order. */
export function reviewPaymentProblem(o: { status: string }, approve: boolean): Refusal | null {
  if (approve && o.status === "CANCELED") {
    return { status: 409, message: "Буюртма бекор қилинган — тўловни тасдиқлаб бўлмайди · Order is canceled — cannot confirm payment" };
  }
  return null;
}
/** A delivery photo may be added to any order that isn't cancelled (open, delivered or closed short). */
export function deliveryProofProblem(o: { status: string }): string | null {
  return o.status === "CANCELED" ? "Бекор қилинган буюртмага сурат қўшиб бўлмайди · Order is canceled" : null;
}

const NEXT = ["PLACED", "IN_PRODUCTION", "DELIVERED", "CANCELED"] as const;
export type GazoblokNextStatus = (typeof NEXT)[number];

/**
 * Why an order may not move to `next`, or null. Finished orders stay final;
 * cancel needs order.cancel and nothing loaded; delivery follows canDeliver;
 * PLACED ⇄ IN_PRODUCTION needs order.edit.
 */
export function nextStatusProblem(
  o: { status: string; shortClosedAt: Date | string | null; quantities: LineQty[]; openShipments: number; remaining: number },
  next: GazoblokNextStatus,
  perms: { edit: boolean; cancel: boolean },
): Refusal | null {
  if (o.status === next) return { status: 409, message: "Буюртма аллақачон шу ҳолатда · Order is already in that status" };
  if (o.status === "CANCELED") return { status: 409, message: "Бекор қилинган буюртмани ўзгартириб бўлмайди · Cannot change a canceled order" };
  if (o.status === "DELIVERED") return { status: 409, message: "Етказилган буюртмани ўзгартириб бўлмайди · A delivered order can't be changed" };
  if (next === "CANCELED") {
    if (!perms.cancel) return { status: 403, message: "Буюртмани бекор қилишга рухсат йўқ · You can't cancel orders" };
    const why = canCancel({ totalLoaded: o.quantities.reduce((s, l) => s + l.loaded, 0) });
    return why ? { status: 409, message: why } : null;
  }
  if (next === "DELIVERED") {
    if (!perms.edit) return { status: 403, message: "Буюртмани ўзгартиришга рухсат йўқ · You can't change orders" };
    const why = canDeliver({ lines: o.quantities, shortClosed: !!o.shortClosedAt, openShipments: o.openShipments, remaining: o.remaining });
    return why ? { status: 409, message: why } : null;
  }
  if (!perms.edit) return { status: 403, message: "Буюртмани ўзгартиришга рухсат йўқ · You can't change orders" };
  if (o.shortClosedAt) return { status: 409, message: "Буюртма қисқа ёпилган · The order was closed short" };
  return null;
}

/**
 * Close short: bill what was loaded. Refused unless the order is open and at least
 * one block was loaded. Over-loaded lines bill at loaded × price, so the separate
 * over-load surcharge becomes 0.
 */
export function closeShortPlan(o: {
  status: string;
  shortClosedAt: Date | string | null;
  lines: { id: string; productId: string | null; productLabel: string; quantity: number; unitPrice: number }[];
  shipments: { loadedLines: unknown }[];
  linesSubtotal: number;
  discountAmount: number;
  deliveryCost: number;
}):
  | { problem: string }
  | { linesSubtotal: number; discountAmount: number; totalPrice: number; overshipAmount: number; quantities: LineQty[] } {
  if (!isOpen(o)) return { problem: "Буюртма ёпилган · The order is already closed" };
  const quantities = lineQuantities(o.lines, o.shipments);
  if (quantities.every((l) => l.loaded === 0)) {
    return { problem: "Ҳеч нарса юкланмаган — буюртмани бекор қилинг · Nothing was loaded — cancel the order instead" };
  }
  const loaded = new Map(quantities.map((l) => [l.lineId, l.loaded]));
  return { ...shortCloseTotals(o.lines, loaded, o), quantities };
}

/**
 * The 409 a truck load gets when it pushes a line over the order and the loader
 * has not confirmed yet: extra blocks, the surcharge (extra × frozen unit price)
 * and which sizes. Null when nothing goes over.
 */
export function overloadRefusal(
  lines: { id: string; productLabel: string; unitPrice: number }[],
  overload: { lineId: string; extra: number }[],
): { status: number; message: string; details: unknown } | null {
  if (!overload.length) return null;
  const line = (id: string) => lines.find((l) => l.id === id)!;
  const extraAmount = round2(overload.reduce((sum, o) => sum + o.extra * line(o.lineId).unitPrice, 0));
  const extraBlocks = overload.reduce((sum, o) => sum + o.extra, 0);
  return {
    status: 409,
    message: `Буюртмадан ортиқ: +${formatNumber(extraBlocks, 0)} та · +${formatNumber(extraAmount, 2)} UZS — тасдиқланг · Over the order — confirm first`,
    details: {
      code: "OVERLOAD_CONFIRM_REQUIRED",
      extraBlocks,
      extraAmount,
      overload: overload.map((o) => ({ ...o, label: line(o.lineId).productLabel })),
    },
  };
}
