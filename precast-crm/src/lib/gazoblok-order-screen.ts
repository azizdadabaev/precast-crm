/**
 * Decisions the gazoblok order screen makes from the detail GET and the user's permissions.
 * Pure (browser-safe) so the rules are tested apart from the page.
 */
import { formatNumber } from "@/lib/utils";
import { canDeliver, isOpen } from "@/lib/gazoblok-rules";
import { parseMoney, uzsText } from "@/lib/gazoblok-text";
import { PAYMENT_METHOD_LABELS } from "@/lib/gazoblok-labels";
import type { LineQty } from "@/lib/gazoblok-quantities";

/** Which header/section actions the user may see. Finished orders are final (no edit, no pin),
 *  but any order can be reordered or shared. Servers enforce the same keys. */
export function screenActions(
  o: { status: string; shortClosedAt: string | null },
  perms: string[],
): { reorder: boolean; edit: boolean; pin: boolean; chat: boolean; refund: boolean } {
  const open = isOpen(o);
  return {
    reorder: perms.includes("order.create"),
    edit: open && perms.includes("order.edit"),
    pin: open && perms.includes("order.edit"),
    chat: perms.includes("inbox.access"),
    refund: perms.includes("payment.confirm"),
  };
}

/** Every reason «Буюртма етказилди» is refused, in canDeliver's own words. canDeliver stops at
 *  the first; each check is run alone here so the operator sees all of them at once. */
export function deliverBlockers(o: {
  quantities: LineQty[];
  shortClosedAt: string | null;
  openShipments: number;
  remaining: number;
}): string[] {
  const shortClosed = !!o.shortClosedAt;
  const checks = [
    canDeliver({ lines: o.quantities, shortClosed, openShipments: 0, remaining: 0 }),
    canDeliver({ lines: [], shortClosed: true, openShipments: o.openShipments, remaining: 0 }),
    canDeliver({ lines: [], shortClosed: true, openShipments: 0, remaining: o.remaining }),
  ];
  return checks.filter((r): r is string => r !== null);
}

/** Cancel is only for orders nothing has left the yard from. */
export function cancelBlock(totalLoaded: number): string | null {
  return totalLoaded > 0 ? `${formatNumber(totalLoaded, 0)} та юкланган` : null;
}

/** The order total is never green unless the order is fully paid. */
export function totalTone(paymentState: string): "text-success" | "text-foreground" {
  return paymentState === "FULLY_PAID" ? "text-success" : "text-foreground";
}

/** How one payment row reads. Refunds are negative confirmed rows. A pending payment on a
 *  cancelled order may be rejected but never approved (the server answers 409). */
export function paymentRow(
  p: { amount: string | number; status: string },
  orderStatus: string,
): { refund: boolean; amountText: string; canApprove: boolean; canReject: boolean } {
  const amount = Number(p.amount);
  const refund = amount < 0;
  const pending = p.status === "PENDING_CONFIRMATION";
  return {
    refund,
    amountText: refund ? `−${uzsText(-amount)}` : uzsText(amount),
    canApprove: pending && orderStatus !== "CANCELED",
    canReject: pending,
  };
}

/** RefundDialog's values → the record_refund action (the note is the required reason). */
export function refundBody(v: { amount: number; method: string; paidOn: string; note: string }) {
  return { action: "record_refund" as const, amount: v.amount, method: v.method, notes: v.note };
}

/** Regroup a typed sum on blur («1500000» → «1 500 000»); unreadable text stays as typed. */
export function regroupMoney(s: string): string {
  const n = parseMoney(s);
  return n === null ? s : uzsText(n);
}

const firstWord = (s: string) => s.trim().split(/\s+/)[0]?.replace(/[^\p{L}]/gu, "").toLowerCase() ?? "";

/** One history row's «нима». The event label is dropped when the message already opens with
 *  the same word («Манзил белгиланди: …»), and a trailing «(CASH)» method enum reads in Uzbek. */
export function historyLine(label: string, message: string): string {
  const text = message.replace(/\((CASH|BANK_TRANSFER|CLICK|PAYME|OTHER)\)$/, (_, m: string) => `(${PAYMENT_METHOD_LABELS[m][0]})`);
  if (!text) return label;
  return firstWord(text) === firstWord(label) ? text : `${label} — ${text}`;
}
