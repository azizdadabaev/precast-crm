export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * GET /api/discrepancies — discrepancy.view
 *   ?status=OPEN | RESOLVED_RECOVERED | RESOLVED_DISCOUNT | RESOLVED_WRITEOFF | DISPUTED
 */
export const GET = withPermission("discrepancy.view", async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;

  const discrepancies = await prisma.discrepancy.findMany({
    where: status ? { status: status as never } : undefined,
    orderBy: { reportedAt: "desc" },
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
