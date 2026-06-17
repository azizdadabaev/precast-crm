export const dynamic = "force-dynamic";
export const revalidate = 30;

import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withPermissionAny } from "@/lib/api-auth";
import { normalizeCity } from "@/lib/city-normalize";

/**
 * GET /api/dashboard — ADMIN | OWNER only.
 *
 * Returns a single payload feeding all 11 dashboard cards. Aggregations
 * use Prisma `aggregate` / `groupBy` where possible; per-row reduction
 * runs over the (typically small) result sets only.
 *
 * Caching: Next's `revalidate = 30` keeps the response cached on the
 * server for 30 s. The client polls every 60 s, so under steady load
 * the DB is hit at most once per cache window.
 *
 * Timezone: Asia/Tashkent has no DST. The server runs in that zone in
 * production (per HANDOFF.md). "This month" boundaries use local
 * calendar dates.
 */

interface RevenueAgg {
  total: number;
  orderCount: number;
}

/**
 * Trend pill data. `deltaPct` is rounded to whole percent. `direction`
 * derives from the sign — "flat" when |delta| < 1% so we don't flash a
 * pill for noise. `polarity` controls the green/red color in the UI:
 * "positive" means an up arrow is good (revenue), "negative" means an
 * up arrow is bad (receivables).
 */
interface Trend {
  deltaPct: number;
  direction: "up" | "down" | "flat";
  polarity: "positive" | "negative";
}

interface DashboardPayload {
  revenueThisMonth: RevenueAgg & {
    periodStart: string;
    periodEnd: string;
    trend: Trend | null;
  };
  revenueAllTime: RevenueAgg;
  averageOrderValue: {
    thisMonth: number;
    allTime: number;
    trend: Trend | null;
  };
  outstandingReceivables: {
    total: number;
    orderCount: number;
    trend: Trend | null;
  };
  activeCustomers: {
    count: number;
    breakdown: { paid: number; partial: number; awaiting: number };
  };
  todayDeliveries: {
    count: number;
    totalArea: number;
    date: string;
    orders: Array<{
      id: string;
      orderNumber: string;
      clientName: string;
      totalArea: number;
    }>;
  };
  openDiscrepancies: { count: number; totalAmount: number };
  cashOnTheRoad: {
    total: number;
    dispatchCount: number;
    drivers: Array<{ id: string; name: string; expected: number }>;
  };
  customersByCity: Array<{ city: string; count: number; revenue: number }>;
  topCustomers: Array<{
    id: string;
    name: string;
    totalRevenue: number;
    orderCount: number;
  }>;
  weekCapacity: {
    utilizationPct: number;
    days: Array<{ date: string; bookedM2: number; capacityM2: number }>;
  };
}

/** Asia/Tashkent calendar-day key for a Date (server is already in that zone). */
function dateKey(d: Date): string {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Capacity per day in m². Mirrors the calendar's heavy threshold so the
 *  dashboard's "100% booked" lines up with the calendar's red zone. */
const CAPACITY_M2_PER_DAY = 600;

/**
 * Build a trend pill from a current vs previous-period number pair.
 * Returns null when there's no previous-period basis (the first month
 * of operation, or any case where dividing by zero is meaningless).
 * |delta| < 1% renders as a flat arrow so noise doesn't trigger
 * green/red flashing.
 */
function buildTrend(
  current: number,
  previous: number,
  polarity: Trend["polarity"],
): Trend | null {
  if (previous <= 0) return null;
  const deltaPct = Math.round(((current - previous) / previous) * 100);
  const direction: Trend["direction"] =
    Math.abs(deltaPct) < 1 ? "flat" : deltaPct > 0 ? "up" : "down";
  return { deltaPct, direction, polarity };
}

// Dashboard accepts EITHER dashboard.viewBasic (ops view) OR
// dashboard.view (financial view). Templates split the two: SALES /
// INVENTORY get only viewBasic, ACCOUNTANT gets only view, and
// OWNER / ADMIN get both. Phase 3 will mask the financial fields
// server-side for viewBasic-only callers; right now the route returns
// the full payload to anyone with at least one of the two permissions.
export const GET = withPermissionAny(
  ["dashboard.viewBasic", "dashboard.view"],
  async () => {

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  // Previous calendar month — for "vs last month" trend pills.
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  // The capacity strip shows Mon..Sun of the current week. Compute
  // Monday by walking back from today. JavaScript's getDay() returns
  // 0..6 with Sunday = 0; we treat Monday as day-1.
  const weekStart = startOfDay(now);
  const dow = (weekStart.getDay() + 6) % 7; // 0 = Mon, 6 = Sun
  weekStart.setDate(weekStart.getDate() - dow);
  const weekEnd = endOfDay(new Date(weekStart));
  weekEnd.setDate(weekStart.getDate() + 6);

  // ── 1+2. Revenue this month + all time ──
  // Revenue = sum(confirmedPaid) on non-canceled orders. confirmedPaid
  // is the only number that's actually been received & confirmed; using
  // totalPrice would inflate revenue by orders that haven't been paid.
  const [
    revenueAllTimeAgg,
    revenueThisMonthAgg,
    revenuePrevMonthAgg,
    receivablesAgg,
    receivablesPrevMonthAgg,
    activeCustomersDistinct,
    activeCustomersBreakdown,
    todayOrders,
    discrepanciesAgg,
    discrepanciesCount,
    cashOnRoadDispatches,
    weekOrders,
    cityRows,
    topClientsRows,
  ] = await Promise.all([
    prisma.order.aggregate({
      _sum: { confirmedPaid: true },
      _count: { _all: true },
      where: { status: { not: "CANCELED" } },
    }),
    prisma.order.aggregate({
      _sum: { confirmedPaid: true },
      _count: { _all: true },
      where: {
        status: { not: "CANCELED" },
        placedAt: { gte: monthStart, lte: monthEnd },
      },
    }),
    // Previous-month revenue + order count, for the trend pills.
    prisma.order.aggregate({
      _sum: { confirmedPaid: true },
      _count: { _all: true },
      where: {
        status: { not: "CANCELED" },
        placedAt: { gte: prevMonthStart, lte: prevMonthEnd },
      },
    }),
    // Outstanding = sum(totalPrice − confirmedPaid) on orders that
    // aren't canceled and aren't fully paid.
    prisma.order.findMany({
      where: {
        status: { not: "CANCELED" },
        paymentState: { in: ["AWAITING_PAYMENT", "PARTIALLY_PAID"] },
      },
      select: { totalPrice: true, confirmedPaid: true, writeOffAmount: true },
    }),
    // Receivables a month ago — proxy for the trend. We capture orders
    // that were already-placed by `prevMonthEnd` AND were still
    // un-paid at the time. Since `confirmedPaid` only ever monotonic-
    // ally grows and our DB doesn't store historical snapshots, this
    // is a best-available comparison: we reconstruct "what was
    // outstanding last month" as `sum(totalPrice − confirmedPaid)`
    // over orders placed by `prevMonthEnd`. If a payment confirmed
    // after `prevMonthEnd` cleared an old order, the past number
    // reflects what's CURRENTLY outstanding from those orders, which
    // understates last month's true number. Acceptable for a trend
    // pill — the direction is what matters.
    prisma.order.findMany({
      where: {
        status: { not: "CANCELED" },
        paymentState: { in: ["AWAITING_PAYMENT", "PARTIALLY_PAID"] },
        placedAt: { lte: prevMonthEnd },
      },
      select: { totalPrice: true, confirmedPaid: true, writeOffAmount: true },
    }),
    prisma.order.groupBy({
      by: ["clientId"],
      where: { status: { not: "CANCELED" } },
    }),
    prisma.order.groupBy({
      by: ["paymentState"],
      _count: { clientId: true },
      where: { status: { not: "CANCELED" } },
    }),
    prisma.order.findMany({
      where: {
        status: { not: "CANCELED" },
        scheduledAt: { gte: todayStart, lte: todayEnd },
      },
      select: {
        id: true,
        orderNumber: true,
        totalArea: true,
        client: { select: { name: true } },
      },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.discrepancy.aggregate({
      _sum: { shortfall: true },
      where: { status: "OPEN" },
    }),
    prisma.discrepancy.count({ where: { status: "OPEN" } }),
    prisma.dispatch.findMany({
      where: { returnedAt: null },
      select: {
        expectedCollection: true,
        driver: { select: { id: true, name: true } },
      },
    }),
    prisma.order.findMany({
      where: {
        status: { not: "CANCELED" },
        scheduledAt: { gte: weekStart, lte: weekEnd },
      },
      select: { scheduledAt: true, totalArea: true },
    }),
    // City aggregation — pull each non-canceled order's client address +
    // confirmedPaid + a unique-client tally. Aggregate in-memory because
    // the city normalization happens in JS, not SQL.
    prisma.order.findMany({
      where: { status: { not: "CANCELED" } },
      take: 10_000,
      select: {
        clientId: true,
        confirmedPaid: true,
        client: { select: { address: true } },
      },
    }),
    // Top customers by revenue.
    prisma.order.groupBy({
      by: ["clientId"],
      _sum: { confirmedPaid: true },
      _count: { _all: true },
      where: { status: { not: "CANCELED" } },
      orderBy: { _sum: { confirmedPaid: "desc" } },
      take: 5,
    }),
  ]);

  // ── Revenue + average ──
  const totalAllTime = Number(revenueAllTimeAgg._sum.confirmedPaid ?? 0);
  const countAllTime = revenueAllTimeAgg._count._all;
  const totalThisMonth = Number(revenueThisMonthAgg._sum.confirmedPaid ?? 0);
  const countThisMonth = revenueThisMonthAgg._count._all;
  const avgAllTime = countAllTime > 0 ? Math.round(totalAllTime / countAllTime) : 0;
  const avgThisMonth = countThisMonth > 0 ? Math.round(totalThisMonth / countThisMonth) : 0;

  // Previous-month numbers, for trend pills.
  const totalPrevMonth = Number(revenuePrevMonthAgg._sum.confirmedPaid ?? 0);
  const countPrevMonth = revenuePrevMonthAgg._count._all;
  const avgPrevMonth = countPrevMonth > 0 ? Math.round(totalPrevMonth / countPrevMonth) : 0;
  const revenueTrend = buildTrend(totalThisMonth, totalPrevMonth, "positive");
  const avgOrderTrend = buildTrend(avgThisMonth, avgPrevMonth, "positive");

  // ── Receivables ──
  let receivablesTotal = 0;
  let receivablesOrders = 0;
  for (const o of receivablesAgg) {
    const due = Number(o.totalPrice) - Number(o.confirmedPaid) - Number(o.writeOffAmount);
    if (due > 0) {
      receivablesTotal += due;
      receivablesOrders += 1;
    }
  }
  let receivablesPrev = 0;
  for (const o of receivablesPrevMonthAgg) {
    const due = Number(o.totalPrice) - Number(o.confirmedPaid) - Number(o.writeOffAmount);
    if (due > 0) receivablesPrev += due;
  }
  // Receivables: up = bad. Polarity NEGATIVE → up arrow renders red.
  const receivablesTrend = buildTrend(receivablesTotal, receivablesPrev, "negative");

  // ── Active customers + breakdown ──
  const activeCustomersCount = activeCustomersDistinct.length;
  const breakdown = { paid: 0, partial: 0, awaiting: 0 };
  for (const row of activeCustomersBreakdown) {
    if (row.paymentState === "FULLY_PAID") breakdown.paid += row._count.clientId;
    else if (row.paymentState === "PARTIALLY_PAID") breakdown.partial += row._count.clientId;
    else if (row.paymentState === "AWAITING_PAYMENT") breakdown.awaiting += row._count.clientId;
  }

  // ── Today's deliveries ──
  const todayCount = todayOrders.length;
  const todayArea = todayOrders.reduce((s, o) => s + Number(o.totalArea), 0);

  // ── Cash on the road ──
  const cashOnRoadTotal = cashOnRoadDispatches.reduce(
    (s, d) => s + Number(d.expectedCollection),
    0,
  );

  // ── Customers by city ──
  // For each canonical city, count UNIQUE clients and sum revenue.
  const cityMap = new Map<string, { clients: Set<string>; revenue: number }>();
  for (const row of cityRows) {
    const city = normalizeCity(row.client.address);
    const cur = cityMap.get(city) ?? { clients: new Set<string>(), revenue: 0 };
    cur.clients.add(row.clientId);
    cur.revenue += Number(row.confirmedPaid);
    cityMap.set(city, cur);
  }
  const cityList = Array.from(cityMap.entries())
    .map(([city, agg]) => ({
      city,
      count: agg.clients.size,
      revenue: Math.round(agg.revenue),
    }))
    .sort((a, b) => b.count - a.count);
  // Top 10 named + "Other" if non-zero.
  const named = cityList.filter((c) => c.city !== "Other").slice(0, 10);
  const other = cityList.find((c) => c.city === "Other");
  const customersByCity =
    other && other.count > 0 ? [...named, other] : named;

  // ── Top 5 customers — hydrate names ──
  const topClientIds = topClientsRows.map((r) => r.clientId);
  const topClientNames = await prisma.client.findMany({
    where: { id: { in: topClientIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(topClientNames.map((c) => [c.id, c.name]));
  const topCustomers = topClientsRows
    .map((r) => ({
      id: r.clientId,
      name: nameById.get(r.clientId) ?? "—",
      totalRevenue: Math.round(Number(r._sum.confirmedPaid ?? 0)),
      orderCount: r._count._all,
    }))
    // Drop any rows with totalRevenue = 0 — they're noise.
    .filter((c) => c.totalRevenue > 0);

  // ── Week capacity strip ──
  const weekDays: Array<{ date: string; bookedM2: number; capacityM2: number }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    weekDays.push({
      date: dateKey(d),
      bookedM2: 0,
      capacityM2: CAPACITY_M2_PER_DAY,
    });
  }
  const weekIndex = new Map(weekDays.map((d, i) => [d.date, i]));
  for (const o of weekOrders) {
    const key = dateKey(new Date(o.scheduledAt));
    const i = weekIndex.get(key);
    if (i !== undefined) {
      weekDays[i].bookedM2 += Number(o.totalArea);
    }
  }
  // Round bookedM2 for clean display.
  for (const d of weekDays) {
    d.bookedM2 = Math.round(d.bookedM2 * 10) / 10;
  }
  const totalBooked = weekDays.reduce((s, d) => s + d.bookedM2, 0);
  const totalCapacity = weekDays.reduce((s, d) => s + d.capacityM2, 0);
  const utilizationPct =
    totalCapacity > 0
      ? Math.round((totalBooked / totalCapacity) * 100)
      : 0;

  const payload: DashboardPayload = {
    revenueThisMonth: {
      total: Math.round(totalThisMonth),
      orderCount: countThisMonth,
      periodStart: dateKey(monthStart),
      periodEnd: dateKey(monthEnd),
      trend: revenueTrend,
    },
    revenueAllTime: {
      total: Math.round(totalAllTime),
      orderCount: countAllTime,
    },
    averageOrderValue: {
      thisMonth: avgThisMonth,
      allTime: avgAllTime,
      trend: avgOrderTrend,
    },
    outstandingReceivables: {
      total: Math.round(receivablesTotal),
      orderCount: receivablesOrders,
      trend: receivablesTrend,
    },
    activeCustomers: { count: activeCustomersCount, breakdown },
    todayDeliveries: {
      count: todayCount,
      totalArea: Math.round(todayArea * 10) / 10,
      date: dateKey(now),
      orders: todayOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        clientName: o.client.name,
        totalArea: Math.round(Number(o.totalArea) * 10) / 10,
      })),
    },
    openDiscrepancies: {
      count: discrepanciesCount,
      totalAmount: Math.round(Number(discrepanciesAgg._sum.shortfall ?? 0)),
    },
    cashOnTheRoad: {
      total: Math.round(cashOnRoadTotal),
      dispatchCount: cashOnRoadDispatches.length,
      drivers: cashOnRoadDispatches
        .filter((d) => d.driver)
        .map((d) => ({
          id: d.driver!.id,
          name: d.driver!.name,
          expected: Math.round(Number(d.expectedCollection)),
        })),
    },
    customersByCity,
    topCustomers,
    weekCapacity: { utilizationPct, days: weekDays },
  };

  return ok(payload);
});
