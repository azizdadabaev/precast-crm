export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { parseQueueStatus, queueCounts } from "@/lib/gazoblok-payments-queue";

/**
 * GET /api/gazoblok/payments?status=PENDING_CONFIRMATION|CONFIRMED|REJECTED
 *
 * Read-only queue for the gazoblok section of /payments. Confirm / reject go
 * through PATCH /api/gazoblok/orders/[id] `confirm_payment`, which locks the
 * order row and recomputes confirmedPaid — this route never writes.
 * Counts cover every status so the tab numbers stay stable across tabs.
 */
const LIST_LIMIT = 200;

export const GET = withPermission("payment.view", async (req: NextRequest) => {
  const status = parseQueueStatus(new URL(req.url).searchParams.get("status"));
  if (!status) return fail("Нотўғри ҳолат · invalid status", 400);

  const [items, groups] = await Promise.all([
    prisma.gazoblokPayment.findMany({
      where: { status },
      orderBy: { recordedAt: "desc" },
      take: LIST_LIMIT,
      select: {
        id: true,
        amount: true,
        method: true,
        status: true,
        recordedAt: true,
        confirmedAt: true,
        notes: true,
        recordedBy: { select: { id: true, name: true } },
        confirmedBy: { select: { id: true, name: true } },
        receipts: { select: { id: true, imageUrl: true } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            totalPrice: true,
            confirmedPaid: true,
            status: true,
            client: { select: { id: true, name: true, phone: true } },
          },
        },
      },
    }),
    prisma.gazoblokPayment.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  return ok({ items, counts: queueCounts(groups) });
});
