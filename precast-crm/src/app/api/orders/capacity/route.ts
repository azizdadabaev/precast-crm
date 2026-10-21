export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { CapacityRangeSchema } from "@/lib/validation";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { CAPACITY_THRESHOLDS } from "@/lib/capacity";
import { calendarBuckets } from "@/lib/calendar-day";
import { dayKey } from "@/lib/dashboard-metrics";

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
 * Owner rule 2026-10-21: a day = the WHOLE orders scheduled that day. Trucks
 * loaded early, late or in parts never move an order to another day — only a
 * reschedule does (see src/lib/calendar-day.ts). Per-truck dates are for the
 * dashboard and stock only.
 */
export const GET = withPermission("order.view", async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const { from, to } = CapacityRangeSchema.parse({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  });

  // Whole LOCAL days. The web sends local-midnight instants and Android sends
  // bare dates (parsed as UTC midnight); both land inside the day they mean.
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
  const orders = await prisma.order.findMany({
    where: { status: { not: "CANCELED" }, scheduledAt: { gte: start, lt: end } },
    select: { id: true, scheduledAt: true, totalArea: true, totalBlocks: true, totalBeams: true },
  });

  const buckets = calendarBuckets(orders);
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
