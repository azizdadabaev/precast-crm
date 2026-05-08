export type PaidVariant = "zero" | "partial" | "full";

export function paidVariant(
  confirmedPaid: string | number,
  totalPrice: string | number,
): PaidVariant {
  const paid = Number(confirmedPaid);
  const total = Number(totalPrice);
  if (!Number.isFinite(paid) || paid <= 0) return "zero";
  if (Number.isFinite(total) && paid >= total) return "full";
  return "partial";
}
