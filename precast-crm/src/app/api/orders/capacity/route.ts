export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { CapacityRangeSchema } from "@/lib/validation";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * GET /api/orders/capacity?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns daily aggregates of scheduled orders so the calendar can color
 * each cell by load:
 *   {
 *     days: [{ date: "2026-05-08", totalArea: 285.4, totalOrders: 3 }, …],
 *     thresholds: { low: 300, moderate: 450, heavy: 600 }
 *   }
 *
 * Days outside the requested range or with no orders are simply omitted.
 * The client fills in zeros for empty days.
 */
export const GET = withPermission("order.view", async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const { from, to } = CapacityRangeSchema.parse({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
  });

  // Pull all orders in window. Filter out CANCELED — they don't consume capacity.
  const orders = await prisma.order.findMany({
    where: {
      scheduledAt: { gte: from, lte: to },
      status: { not: "CANCELED" },
    },
    select: { id: true, scheduledAt: true, totalArea: true },
  });

  // Bucket by YYYY-MM-DD in the server's local zone (Asia/Tashkent on prod is fine)
  const byDay = new Map<string, { totalArea: number; totalOrders: number }>();
  for (const o of orders) {
    const d = new Date(o.scheduledAt);
    const key =
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0");
    const cur = byDay.get(key) ?? { totalArea: 0, totalOrders: 0 };
    cur.totalArea += Number(o.totalArea);
    cur.totalOrders += 1;
    byDay.set(key, cur);
  }

  const days = Array.from(byDay.entries())
    .map(([date, agg]) => ({
      date,
      totalArea: Math.round(agg.totalArea * 100) / 100,
      totalOrders: agg.totalOrders,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return ok({
    days,
    thresholds: { low: 300, moderate: 450, heavy: 600 }, // m² per day
  });
});
