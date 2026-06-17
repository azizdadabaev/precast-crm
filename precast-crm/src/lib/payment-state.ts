import type { OrderPaymentState } from "@prisma/client";

/**
 * Single source of truth for the write-off-aware "fully paid" rule.
 *
 * An order counts as FULLY_PAID when confirmedPaid + writeOffAmount >=
 * totalPrice. A leftover balance that was deliberately written off
 * ("settle remaining") therefore contributes to the paid side and must
 * never silently un-settle a later recompute.
 *
 * All inputs are plain numbers (Decimal columns come through as
 * strings/Decimal — convert via Number() at the call site).
 */
export function paymentStateFor(
  confirmedPaid: number,
  writeOffAmount: number,
  totalPrice: number,
): OrderPaymentState {
  const paidSide = confirmedPaid + writeOffAmount;
  if (paidSide >= totalPrice && totalPrice > 0) return "FULLY_PAID";
  if (confirmedPaid > 0) return "PARTIALLY_PAID";
  return "AWAITING_PAYMENT";
}

/**
 * Remaining balance owed, clamped at 0. Subtracts both confirmed
 * payments AND any written-off amount. Pass `pending` to also exclude
 * payments awaiting confirmation (used by the record-payment ceiling).
 */
export function remainingBalance(
  totalPrice: number,
  confirmedPaid: number,
  writeOffAmount: number,
  pending = 0,
): number {
  return Math.max(0, totalPrice - confirmedPaid - writeOffAmount - pending);
}
