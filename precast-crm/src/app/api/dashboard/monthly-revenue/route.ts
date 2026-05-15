export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

/**
 * GET /api/dashboard/monthly-revenue
 *
 * Returns the last 12 months of revenue (current month + 11 prior),
 * one row per month, ordered oldest → newest. Months with zero
 * placed orders still appear (revenue: 0) so the line chart has a
 * continuous x-axis. CANCELED orders are excluded — same posture as
 * the rest of the dashboard's revenue queries.
 *
 * Bucketing uses the server's local TZ (`Asia/Tashkent` in prod) via
 * Date#getFullYear()/getMonth() — matches every other day/month
 * filter in the app so an operator picking "May" sees the same
 * window the calendar paints.
 *
 * Currency is UZS. We return integer (rounded) values because the
 * chart only renders to 2-3 significant figures anyway.
 */
export const GET = withPermission("dashboard.view", async () => {
  const now = new Date();
  const startYear = now.getFullYear();
  const startMonth = now.getMonth(); // 0-indexed

  // 11 months back, anchored at the first instant of that month.
  const windowStart = new Date(startYear, startMonth - 11, 1, 0, 0, 0, 0);

  // Pull every non-canceled order in the window. For our volume (a
  // few thousand orders/yr) this is plenty fast and avoids a raw SQL
  // date_trunc that would have to switch dialects in tests.
  const orders = await prisma.order.findMany({
    where: {
      status: { not: "CANCELED" },
      placedAt: { gte: windowStart },
    },
    select: { placedAt: true, totalPrice: true },
  });

  // Build the 12 contiguous buckets up front so empty months render.
  const buckets: Array<{ monthKey: string; monthLabel: string; year: number; revenue: number; orderCount: number }> = [];
  const MONTH_UZ_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  for (let i = 0; i < 12; i++) {
    const d = new Date(startYear, startMonth - 11 + i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();
    buckets.push({
      monthKey: `${y}-${String(m + 1).padStart(2, "0")}`,
      monthLabel: MONTH_UZ_SHORT[m]!,
      year: y,
      revenue: 0,
      orderCount: 0,
    });
  }

  // Accumulate monthly and daily in a single pass.
  const dayBuckets = new Map<string, {
    date: number; dayLabel: string; monthKey: string; revenue: number; orderCount: number;
  }>();

  for (const o of orders) {
    const pd = new Date(o.placedAt);
    const y = pd.getFullYear();
    const m = pd.getMonth();
    const d = pd.getDate();

    // Monthly
    const idx = (y - startYear) * 12 + (m - startMonth + 11);
    if (idx >= 0 && idx < 12) {
      buckets[idx]!.revenue += Number(o.totalPrice);
      buckets[idx]!.orderCount += 1;
    }

    // Daily
    const dayKey = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!dayBuckets.has(dayKey)) {
      dayBuckets.set(dayKey, {
        date: new Date(y, m, d).getTime(),
        dayLabel: `${d} ${MONTH_UZ_SHORT[m]}`,
        monthKey: `${y}-${String(m + 1).padStart(2, "0")}`,
        revenue: 0,
        orderCount: 0,
      });
    }
    const db = dayBuckets.get(dayKey)!;
    db.revenue += Number(o.totalPrice);
    db.orderCount += 1;
  }

  const days = Array.from(dayBuckets.values())
    .sort((a, b) => a.date - b.date)
    .map((d) => ({ ...d, revenue: Math.round(d.revenue) }));

  const total = buckets.reduce((s, b) => s + b.revenue, 0);
  const totalOrders = buckets.reduce((s, b) => s + b.orderCount, 0);

  // YoY-ish indicator: compare the most-recent 6 months to the
  // 6 before them. Cleaner than a fragile "vs last month" number
  // because a single zero month can swing month-on-month wildly.
  const recent6 = buckets.slice(6).reduce((s, b) => s + b.revenue, 0);
  const prior6 = buckets.slice(0, 6).reduce((s, b) => s + b.revenue, 0);
  const trendPct = prior6 > 0 ? ((recent6 - prior6) / prior6) * 100 : null;

  return ok({
    months: buckets.map((b) => ({
      monthKey: b.monthKey,
      monthLabel: b.monthLabel,
      year: b.year,
      revenue: Math.round(b.revenue),
      orderCount: b.orderCount,
    })),
    days,
    total: Math.round(total),
    totalOrders,
    trendPct: trendPct === null ? null : Math.round(trendPct * 10) / 10,
  });
});
