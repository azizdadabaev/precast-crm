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
