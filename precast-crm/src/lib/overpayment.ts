// Money the company owes a client back (owner 2026-10-20).
//
// An order edited down after it was paid, a confirmation adjusted upward, or a
// paid order canceled all leave the client having paid more than they owe.
// The owner gives that money back; until it is recorded as a refund the order
// must say so. A refund is a CONFIRMED Payment with a NEGATIVE amount, so every
// existing sum (confirmedPaid, revenue by day, ledger) nets it out by itself.
//
// Pure and browser-safe: the routes, the order page and the orders filter share it.

/** Below this an overpayment is rounding (a client paying 4 500 000 for 4 499 950). */
export const OVERPAY_ALERT_MIN = 1_000;

type NumLike = number | string | { toString(): string } | null | undefined;
const num = (v: NumLike): number => (v == null ? 0 : Number(typeof v === 'object' ? v.toString() : v));

export interface RefundInput {
  status: string;
  totalPrice: NumLike;
  confirmedPaid: NumLike;
  writeOffAmount: NumLike;
}

/**
 * What the client is owed back. A live order owes back what was paid beyond
 * what they owe (total − write-off); a canceled one owes back everything still
 * confirmed. Rounded to tiyin so Decimal noise never reads as a debt.
 */
export function refundDue(o: RefundInput): number {
  const paid = num(o.confirmedPaid);
  const due = o.status === 'CANCELED' ? paid : paid - (num(o.totalPrice) - num(o.writeOffAmount));
  return Math.max(0, Math.round(due * 100) / 100);
}

/** Large enough to act on — the order shows it and the owners are told. */
export function owesRefund(o: RefundInput): boolean {
  return refundDue(o) >= OVERPAY_ALERT_MIN;
}

/**
 * Why a refund of `amount` cannot be recorded, or null when it can. A refund
 * closes a debt that exists — never more than is owed, so it cannot be used to
 * take money off an order the client still owes on.
 */
export function refundProblem(due: number, amount: number): string | null {
  if (due < 0.01) return "Бу буюртмада қайтариладиган пул йўқ · Nothing is due back on this order";
  if (amount > due + 0.005) {
    const max = Math.round(due).toLocaleString("ru-RU");
    return `Қайтариш ${max} UZS дан ошмайди · A refund cannot exceed ${max} UZS`;
  }
  return null;
}

/** A write took the refund due across the threshold or grew it — worth a notification. */
export function becameOwed(before: number, after: number): boolean {
  return after >= OVERPAY_ALERT_MIN && after > before;
}
