export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { orderCounts } from "@/lib/gazoblok-order-list";

/** GET /api/gazoblok/orders/counts — `order.view`. Whole-list counts for the
 *  orders-list pills and seller select (spec §9); not narrowed by filters. */
export const GET = withPermission("order.view", async () => {
  const rows = await prisma.gazoblokOrder.findMany({
    select: {
      status: true,
      totalPrice: true,
      confirmedPaid: true,
      overshipAmount: true,
      createdById: true,
      _count: { select: { payments: { where: { status: "PENDING_CONFIRMATION" } } } },
    },
  });
  const sellerIds = Array.from(new Set(rows.flatMap((r) => (r.createdById ? [r.createdById] : []))));
  const users = sellerIds.length
    ? await prisma.user.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true } })
    : [];
  return ok(
    orderCounts(
      rows.map((r) => ({
        status: r.status,
        totalPrice: Number(r.totalPrice),
        confirmedPaid: Number(r.confirmedPaid),
        overshipAmount: Number(r.overshipAmount),
        pendingCount: r._count.payments,
        createdById: r.createdById,
      })),
      new Map(users.map((u) => [u.id, u.name])),
    ),
  );
});
