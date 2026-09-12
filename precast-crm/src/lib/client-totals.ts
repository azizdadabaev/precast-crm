// Client-list total (Android "booked total" per client + total-sort).
//
// A client's total is the sum of totalPrice across their live (non-canceled,
// non-draft) orders — computed server-side via prisma.order.groupBy so a
// single query covers a whole page of clients rather than N+1 lookups.

type Group = { clientId: string; _sum: { totalPrice: unknown } };

/** Attach `totalBooked` (whole UZS) to each row from a clientId → sum groupBy. */
export function attachTotals<T extends { id: string }>(
  rows: T[],
  groups: Group[],
): Array<T & { totalBooked: number }> {
  const byId = new Map(
    groups.map((g) => [g.clientId, Math.round(Number(g._sum.totalPrice ?? 0))]),
  );
  return rows.map((r) => ({ ...r, totalBooked: byId.get(r.id) ?? 0 }));
}

/** Sort by totalBooked, ties broken by name — stable regardless of fetch order. */
export function sortByTotal<T extends { name: string; totalBooked: number }>(
  rows: T[],
  dir: "asc" | "desc",
): T[] {
  const s = dir === "asc" ? 1 : -1;
  return [...rows].sort(
    (a, b) => (a.totalBooked - b.totalBooked) * s || a.name.localeCompare(b.name),
  );
}
