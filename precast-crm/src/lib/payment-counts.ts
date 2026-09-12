// Payment-tab counts for the Android payments queue (pending/confirmed/rejected).
//
// Computed via prisma.payment.groupBy({ by: ["status"] }) against a where
// clause that excludes the `status` filter itself, so the three tab counts
// stay stable while the caller flips between tabs.

type Group = { status: string; _count: { _all: number } };

/** Zero-fill the three payment tabs from a status → count groupBy. */
export function countsFrom(groups: Group[]) {
  const n = (s: string) => groups.find((g) => g.status === s)?._count._all ?? 0;
  return { pending: n("PENDING_CONFIRMATION"), confirmed: n("CONFIRMED"), rejected: n("REJECTED") };
}
