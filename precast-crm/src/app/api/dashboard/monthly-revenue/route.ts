export const dynamic = "force-dynamic";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { accumulateByMonth, dayKey, monthWindow } from "@/lib/dashboard-metrics";

/**
 * GET /api/dashboard/monthly-revenue
 *
 * Last 12 months (current month + 11 prior), one row per month, ordered
 * oldest → newest. Months with no activity still appear (zeros) so a line
 * chart keeps a continuous x-axis.
 *
 * TWO metrics are returned and neither is called "revenue" — the route
 * used to return Σ totalPrice under the name `revenue` while
 * `fetchDashboardData()` returned Σ confirmedPaid under the same name, so
 * the two dashboards disagreed by exactly the outstanding receivable:
 *
 *   • `booked`    «Буюртма қилинган · Booked»  — Σ Order.totalPrice over
 *     live orders, bucketed by `Order.placedAt`. What was SOLD.
 *   • `collected` «Тушган пул · Collected»     — Σ Payment.amount over
 *     CONFIRMED payments, bucketed by `Payment.confirmedAt` (when the cash
 *     was confirmed received, not `recordedAt` = when it was typed in).
 *     What was RECEIVED.
 *
 * CANCELED (and the reserved DRAFT) orders are excluded from both, same
 * posture as `fetchDashboardData()`. `amount` is used rather than
 * `originalAmount` — the latter is the pre-adjustment audit trail, not cash.
 *
 * Bucketing uses the server's local TZ (`Asia/Tashkent` in prod) via
 * Date#getFullYear()/getMonth() — matches every other day/month filter in
 * the app so an operator picking "May" sees the same window the calendar
 * paints. Never `date_trunc`/UTC: that shifts every local date by one day.
 *
 * Currency is UZS. Values are rounded to whole UZS.
 */
const LIVE_ORDERS: Prisma.OrderWhereInput = {
  status: { notIn: ["CANCELED", "DRAFT"] },
};

export const GET = withPermission("dashboard.view", async () => {
  const now = new Date();

  // 11 months back, anchored at the first instant of that month.
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0);

  // Pull every live order + confirmed payment in the window. For our
  // volume (a few thousand orders/yr) this is plenty fast and avoids a raw
  // SQL date_trunc that would have to switch dialects in tests.
  const [orders, payments] = await Promise.all([
    prisma.order.findMany({
      where: { ...LIVE_ORDERS, placedAt: { gte: windowStart } },
      select: { placedAt: true, totalPrice: true },
    }),
    prisma.payment.findMany({
      where: {
        status: "CONFIRMED",
        order: LIVE_ORDERS,
        confirmedAt: { gte: windowStart },
      },
      select: { confirmedAt: true, amount: true },
    }),
  ]);

  // Monthly — build the 12 contiguous buckets up front so empty months render.
  const bookedByMonth = accumulateByMonth(orders, (o) => o.placedAt, (o) => Number(o.totalPrice));
  const collectedByMonth = accumulateByMonth(payments, (p) => p.confirmedAt, (p) => Number(p.amount));

  const months = monthWindow(now, 12).map((b) => {
    const booked = bookedByMonth.get(b.key);
    const collected = collectedByMonth.get(b.key);
    return {
      monthKey: b.key,
      monthLabel: b.label.toLowerCase(),
      year: b.year,
      booked: Math.round(booked?.total ?? 0),
      collected: Math.round(collected?.total ?? 0),
      orderCount: booked?.count ?? 0,
      paymentCount: collected?.count ?? 0,
    };
  });

  // Daily — sparse (only days with activity), sorted oldest → newest.
  const dayMap = new Map<
    string,
    { date: number; dayLabel: string; monthKey: string; booked: number; collected: number; orderCount: number; paymentCount: number }
  >();
  const MONTH_UZ_LOWER = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

  function dayBucket(d: Date) {
    const key = dayKey(d);
    let bucket = dayMap.get(key);
    if (!bucket) {
      bucket = {
        date: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
        dayLabel: `${d.getDate()} ${MONTH_UZ_LOWER[d.getMonth()]}`,
        monthKey: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        booked: 0,
        collected: 0,
        orderCount: 0,
        paymentCount: 0,
      };
      dayMap.set(key, bucket);
    }
    return bucket;
  }

  for (const o of orders) {
    const b = dayBucket(new Date(o.placedAt));
    b.booked += Number(o.totalPrice);
    b.orderCount += 1;
  }
  for (const p of payments) {
    if (!p.confirmedAt) continue;
    const b = dayBucket(new Date(p.confirmedAt));
    b.collected += Number(p.amount);
    b.paymentCount += 1;
  }

  const days = Array.from(dayMap.values())
    .sort((a, b) => a.date - b.date)
    .map((d) => ({ ...d, booked: Math.round(d.booked), collected: Math.round(d.collected) }));

  const totalBooked = months.reduce((s, m) => s + m.booked, 0);
  const totalCollected = months.reduce((s, m) => s + m.collected, 0);
  const totalOrders = months.reduce((s, m) => s + m.orderCount, 0);

  // YoY-ish indicator: compare the most-recent 6 months to the
  // 6 before them. Cleaner than a fragile "vs last month" number
  // because a single zero month can swing month-on-month wildly.
  function halfOverHalfPct(values: number[]): number | null {
    const prior6 = values.slice(0, 6).reduce((s, v) => s + v, 0);
    const recent6 = values.slice(6).reduce((s, v) => s + v, 0);
    if (prior6 <= 0) return null;
    return Math.round(((recent6 - prior6) / prior6) * 100 * 10) / 10;
  }

  return ok({
    months,
    days,
    totalBooked,
    totalCollected,
    totalOrders,
    bookedTrendPct: halfOverHalfPct(months.map((m) => m.booked)),
    collectedTrendPct: halfOverHalfPct(months.map((m) => m.collected)),
  });
});
