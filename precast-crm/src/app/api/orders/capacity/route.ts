export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { CapacityRangeSchema } from "@/lib/validation";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { CAPACITY_THRESHOLDS } from "@/lib/capacity";
import { dayBuckets } from "@/lib/fulfilment";
import { dayKey } from "@/lib/dashboard-metrics";
import { FULFILMENT_SELECT, dayWindowWhere, fulfilmentOf } from "@/lib/fulfilment-data";

/**
 * GET /api/orders/capacity?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns daily aggregates of scheduled orders so the calendar can color
 * each cell by load:
 *   {
 *     days: [{ date: "2026-05-08", totalArea: 285.4, totalOrders: 3, totalBlocks: 1216 }, …],
 *     thresholds: { low: 300, moderate: 450, heavy: 600 }
 *   }
 *
 * Days outside the requested range or with no orders are simply omitted.
 * The client fills in zeros for empty days.
 *
 * Real data (owner 2026-10-06): a day = goods that actually LEFT that day
 * (each truck on its loading day, a single-truck order on its loading day, an
 * unrecorded remainder on its completion day) + what is still LEFT TO SHIP of
 * orders scheduled that day. A partly shipped order therefore no longer puts
 * its whole m² on its scheduled day. Same engine as the dashboard.
 */
export const GET = withPermission("order.view", async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const { from, to } = CapacityRangeSchema.parse({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  });

  // Whole LOCAL days. The web sends local-midnight instants and Android sends
  // bare dates (parsed as UTC midnight); both land inside the day they mean.
  // Truck loads carry real clock times, so the window must cover full days.
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
  const orders = await prisma.order.findMany({
    where: { AND: [{ status: { not: "CANCELED" } }, dayWindowWhere(start, end)] },
    select: FULFILMENT_SELECT,
  });

  const buckets = dayBuckets(orders.map((o) => ({ id: o.id, f: fulfilmentOf(o) })));
  const fromKey = dayKey(start);
  const toKey = dayKey(to);
  const days = Array.from(buckets.entries())
    .filter(([date]) => date >= fromKey && date <= toKey)
    .map(([date, b]) => ({
      date,
      totalArea: Math.round(b.area * 100) / 100,
      totalOrders: b.orderIds.size,
      totalBlocks: b.blocks,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return ok({
    days,
    thresholds: CAPACITY_THRESHOLDS,
  });
});
