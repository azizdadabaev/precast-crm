export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * GET /api/discrepancies — discrepancy.view
 *   ?status=OPEN | RESOLVED_RECOVERED | RESOLVED_DISCOUNT | RESOLVED_WRITEOFF | DISPUTED
 *
 * Capped at LIST_LIMIT rows, newest-first: both callers fetch the whole list and
 * filter client-side, so unbounded it grows with every shortfall ever flagged.
 */
const LIST_LIMIT = 500;

export const GET = withPermission("discrepancy.view", async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;

  const discrepancies = await prisma.discrepancy.findMany({
    where: status ? { status: status as never } : undefined,
    orderBy: { reportedAt: "desc" },
    take: LIST_LIMIT,
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          totalPrice: true,
          confirmedPaid: true,
          paymentState: true,
          client: { select: { id: true, name: true, phone: true } },
        },
      },
      driver: { select: { id: true, name: true, phone: true } },
      reportedBy: { select: { id: true, name: true } },
      resolvedBy: { select: { id: true, name: true } },
    },
  });
  return ok(discrepancies);
});
