import { paymentStateFor } from "./payment-state";

export type PaidVariant = "zero" | "partial" | "full";

// Mirrors the server's write-off-aware paymentState (payment-state.ts) so a
// settled order (confirmedPaid + writeOffAmount >= totalPrice) shows as
// fully paid here too, instead of "partial" whenever the write-off covers
// the gap left by confirmedPaid alone.
export function paidVariant(
  confirmedPaid: string | number,
  totalPrice: string | number,
  writeOffAmount: string | number = 0,
): PaidVariant {
  const paid = Number(confirmedPaid);
  const total = Number(totalPrice);
  const writeOff = Number(writeOffAmount);
  const state = paymentStateFor(paid, Number.isFinite(writeOff) ? writeOff : 0, total);
  if (state === "FULLY_PAID") return "full";
  if (state === "PARTIALLY_PAID") return "partial";
  return "zero";
}

/**
 * The discount as the order's cost column PRINTS it, so that column adds up.
 *
 * `Order.discountAmount` is `Decimal(14,2)` and a percentage discount lands on a half often
 * enough to matter: 2,5 % of 15 456 460 is 386 411,50, which on its own prints «386 412» while
 * «Жами» — struck from 15 370 048,50 — prints «15 370 049». A customer adding the printed
 * figures then gets one UZS less than the price they are asked for.
 *
 * So the discount is derived from its printed neighbours: `roomsSubtotal − (totalPrice −
 * deliveryCost − otherCost)`, all four rounded to whole UZS first. The three it is derived from
 * are what was quoted and what is invoiced; the discount is the line the arithmetic can absorb a
 * half into. Nothing charged changes — `totalPrice` is the server's own figure and is untouched.
 *
 * When the derived figure cannot be trusted — negative, or more than 1 UZS away from the stored
 * discount, which means the stored total was not struck from these components — the stored
 * discount is printed instead and the column is left as it was.
 *
 * The arithmetic runs on whole-UZS integers only: every input is rounded before it is used, so no
 * fractional float is ever added or subtracted. All five fields are non-negative, which makes
 * `Math.round` the same HALF_UP the server's `Decimal` and `Intl.NumberFormat` apply.
 *
 * Mirror of the Android client's `OrderDetail.displayedDiscount` (`core/model/.../Order.kt`),
 * which derives the same figure the same way from a placed order — so the phone, this page and
 * the print sheet agree to the UZS.
 */
export function displayedDiscount(order: {
  roomsSubtotal: string | number;
  discountAmount: string | number;
  deliveryCost: string | number;
  otherCost: string | number;
  totalPrice: string | number;
}): number {
  const whole = (v: string | number) => Math.round(Number(v));
  const stored = whole(order.discountAmount);
  const subtotal = whole(order.roomsSubtotal);
  const total = whole(order.totalPrice);
  const delivery = whole(order.deliveryCost);
  const other = whole(order.otherCost);
  if (![stored, subtotal, total, delivery, other].every(Number.isFinite)) return stored;
  const derived = subtotal - (total - delivery - other);
  if (derived < 0 || Math.abs(derived - stored) > 1) return stored;
  return derived;
}
