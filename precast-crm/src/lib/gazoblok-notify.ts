// Pure builders for gazoblok bell notices. Routes fire these after their
// transaction commits. Every notice links via gazoblokOrderId and never sets
// orderId: that column belongs to beam-and-block orders, and a gazoblok id there
// would open /orders/{id} (404).

import type { CreateNotificationInput } from "@/lib/notifications";
import { PAYMENT_METHOD_LABELS } from "@/lib/gazoblok-labels";
import { formatNumber } from "@/lib/utils";

export type GazoblokNotice = Omit<CreateNotificationInput, "userIds">;

type OrderRef = { id: string; orderNumber: string };

function uzs(amount: number): string {
  return `${formatNumber(amount, 0)} UZS`;
}

function methodLabel(method: string): string {
  const label = PAYMENT_METHOD_LABELS[method];
  if (!label) return method;
  const [uz, en] = label;
  return uz === en ? uz : `${uz} · ${en}`;
}

export function placedNotice(o: OrderRef & { clientName: string }): GazoblokNotice {
  return {
    type: "ORDER_PLACED",
    title: `Янги газоблок буюртма №${o.orderNumber} · New gazoblok order #${o.orderNumber}`,
    body: o.clientName,
    gazoblokOrderId: o.id,
  };
}

export function paymentPendingNotice(
  o: OrderRef,
  p: { id: string; amount: number; method: string },
): GazoblokNotice {
  return {
    type: "PAYMENT_RECORDED",
    title: `Газоблок тўлови ${uzs(p.amount)} · №${o.orderNumber} · Gazoblok payment ${uzs(p.amount)} · #${o.orderNumber}`,
    body: methodLabel(p.method),
    gazoblokOrderId: o.id,
    paymentId: p.id,
  };
}

export function paymentDecisionNotice(
  o: OrderRef,
  p: { id: string; amount: number },
  approved: boolean,
): GazoblokNotice {
  const uz = approved ? "тасдиқланди" : "рад этилди";
  const en = approved ? "confirmed" : "rejected";
  return {
    type: approved ? "PAYMENT_CONFIRMED" : "PAYMENT_REJECTED",
    title: `Газоблок тўловингиз ${uz}: ${uzs(p.amount)} · №${o.orderNumber} · Your gazoblok payment was ${en}: ${uzs(p.amount)} · #${o.orderNumber}`,
    gazoblokOrderId: o.id,
    paymentId: p.id,
  };
}

/** The actor never gets a bell for their own action. */
export function recipients(userIds: string[], actorId: string): string[] {
  return Array.from(new Set(userIds)).filter((id) => id !== actorId);
}
