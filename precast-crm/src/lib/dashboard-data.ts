import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { normalizeCity } from '@/lib/city-normalize';
import {
  accumulateByMonth,
  averageOrderValue,
  countDistinct,
  dayKey,
  monthWindow,
  outstandingAmount,
} from '@/lib/dashboard-metrics';

// ── Order / payment sets used by every metric below ─────────────────────────
//
// LIVE_ORDERS — the denominator for every order-based metric on this page
// (booked, AOV, receivables, active customers, capacity, city split, top
// customers, charts). `CANCELED` is money that never happened; `DRAFT` is
// reserved on OrderStatus and unused today (drafts live on Project.status),
// but it is excluded so a future draft order can never inflate a KPI.
// Previously this file mixed `{ not: 'CANCELED' }` and
// `{ notIn: ['CANCELED','DRAFT'] }`; the sets are now identical everywhere.
// Conversion / funnel counts, if one is ever added here, must be derived
// from the ORDERS (a project is converted when it has ≥1 order matching
// LIVE_ORDERS) and never from `Project.status`: cancelling an order rewrites
// `Project.status` back to DRAFT (`/api/orders/[id]/cancel`) so that the
// operator can re-place it, which makes a cancelled sale look like a live
// draft. This file queries no projects today — keep it that way.
const LIVE_ORDERS: Prisma.OrderWhereInput = {
  status: { notIn: ['CANCELED', 'DRAFT'] },
};

// COLLECTED_PAYMENTS — the denominator for every cash figure. Only
// CONFIRMED rows count: PENDING_CONFIRMATION is unverified and REJECTED
// never arrived. `amount` (not `originalAmount`) is the cash actually
// received — `originalAmount` is the pre-adjustment audit trail. Payments
// attached to a canceled order are excluded so cash and orders share one
// denominator.
const COLLECTED_PAYMENTS: Prisma.PaymentWhereInput = {
  status: 'CONFIRMED',
  order: LIVE_ORDERS,
};

// ── Types ───────────────────────────────────────────────────────────────────

/**
 * Trend pill data. `deltaPct` is rounded to whole percent. `direction`
 * derives from the sign — "flat" when |delta| < 1% so we don't flash a
 * pill for noise. `polarity` controls the green/red color in the UI:
 * "positive" means an up arrow is good (booked/collected), "negative"
 * means an up arrow is bad (receivables).
 */
interface Trend {
  deltaPct: number;
  direction: 'up' | 'down' | 'flat';
  polarity: 'positive' | 'negative';
}

export interface DashboardPayload {
  /**
   * BOOKED «Буюртма қилинган · Booked» — Σ Order.totalPrice over
   * LIVE_ORDERS, bucketed by `placedAt`. What was SOLD. Never labelled
   * bare "revenue" — see `dashboard-metrics.ts`.
   */
  bookedThisMonth: {
    total: number;
    orderCount: number;
    periodStart: string;
    periodEnd: string;
    trend: Trend | null;
  };
  bookedAllTime: { total: number; orderCount: number };
  /**
   * COLLECTED «Тушган пул · Collected» — Σ Payment.amount over
   * COLLECTED_PAYMENTS, bucketed by `Payment.confirmedAt` (when the money
   * was confirmed as received, not when it was typed in). What was
   * RECEIVED. `Order.confirmedPaid` carries no date and so can never form
   * a time series.
   */
  collectedThisMonth: {
    total: number;
    paymentCount: number;
    periodStart: string;
    periodEnd: string;
    trend: Trend | null;
  };
  collectedAllTime: { total: number; paymentCount: number };
  /** AOV = Σ totalPrice ÷ order count over LIVE_ORDERS. Booked per order. */
  averageOrderValue: { thisMonth: number; allTime: number; trend: Trend | null };
  outstandingReceivables: { total: number; orderCount: number; trend: Trend | null };
  /** Count of DISTINCT clients holding at least one live order. */
  activeCustomers: { count: number };
  /**
   * ORDER ROWS per payment state — disjoint buckets that sum to the live
   * order count. Deliberately not a per-customer split: one client can
   * hold orders in several states at once, so a customer breakdown would
   * overlap and could not be drawn as a donut.
   */
  ordersByPaymentState: { paid: number; partial: number; awaiting: number };
  todayDeliveries: {
    count: number;
    totalArea: number;
    date: string;
    orders: Array<{ id: string; orderNumber: string; clientName: string; totalArea: number }>;
  };
  openDiscrepancies: { count: number; totalAmount: number };
  cashOnTheRoad: { total: number; dispatchCount: number; drivers: Array<{ id: string; name: string; expected: number }> };
  /** `collected` = Σ Order.confirmedPaid for that city's live orders. */
  customersByCity: Array<{ city: string; count: number; collected: number }>;
  /** Ranked by cash collected, not by booked value. */
  topCustomers: Array<{ id: string; name: string; totalCollected: number; orderCount: number }>;
  weekCapacity: { utilizationPct: number; days: Array<{ date: string; bookedM2: number; capacityM2: number }> };
  bookedByMonth: Array<{ month: string; booked: number }>;
  collectedByMonth: Array<{ month: string; collected: number }>;
  ordersByMonth: Array<{ month: string; count: number }>;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    clientName: string;
    primaryProductLabel: string;
    totalArea: number;
    totalPrice: number;
    paymentState: 'FULLY_PAID' | 'PARTIALLY_PAID' | 'AWAITING_PAYMENT';
  }>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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
  polarity: Trend['polarity'],
): Trend | null {
  if (previous <= 0) return null;
  const deltaPct = Math.round(((current - previous) / previous) * 100);
  const direction: Trend['direction'] =
    Math.abs(deltaPct) < 1 ? 'flat' : deltaPct > 0 ? 'up' : 'down';
  return { deltaPct, direction, polarity };
}

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Runs every dashboard aggregation query and returns the full DashboardPayload.
 * Called by both GET /api/dashboard and the MCP get_dashboard tool so both
 * surfaces always return identical numbers.
 *
 * All day/month bucketing uses the server's LOCAL calendar (TZ=Asia/Tashkent
 * in prod). Do not switch to UTC or `date_trunc`: `scheduledAt` stores a local
 * date as the previous day 19:00Z, so UTC bucketing shifts every date by one.
 */
export async function fetchDashboardData(): Promise<DashboardPayload> {
  const now = new Date();
  // Rolling 12-month window — start of the month 11 months ago
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0);
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

  const [
    bookedAllTimeAgg,
    bookedThisMonthAgg,
    bookedPrevMonthAgg,
    collectedAllTimeAgg,
    collectedThisMonthAgg,
    collectedPrevMonthAgg,
    receivablesRows,
    receivablesPrevMonthRows,
    activeCustomerRows,
    ordersByStateRows,
    todayOrders,
    discrepanciesAgg,
    discrepanciesCount,
    cashOnRoadDispatches,
    weekOrders,
    cityRows,
    topClientsRows,
    rollingOrders,
    rollingPayments,
    recentOrdersRaw,
  ] = await Promise.all([
    // ── 1-3. BOOKED — Σ totalPrice by placedAt, over LIVE_ORDERS ──
    prisma.order.aggregate({
      _sum: { totalPrice: true },
      _count: { _all: true },
      where: LIVE_ORDERS,
    }),
    prisma.order.aggregate({
      _sum: { totalPrice: true },
      _count: { _all: true },
      where: { ...LIVE_ORDERS, placedAt: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.order.aggregate({
      _sum: { totalPrice: true },
      _count: { _all: true },
      where: { ...LIVE_ORDERS, placedAt: { gte: prevMonthStart, lte: prevMonthEnd } },
    }),
    // ── 4-6. COLLECTED — Σ Payment.amount by confirmedAt ──
    // All-time deliberately has no date filter, so a legacy CONFIRMED row
    // with a null `confirmedAt` still counts toward the total even though
    // it cannot be placed in a month bucket.
    prisma.payment.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: COLLECTED_PAYMENTS,
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: { ...COLLECTED_PAYMENTS, confirmedAt: { gte: monthStart, lte: monthEnd } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: { ...COLLECTED_PAYMENTS, confirmedAt: { gte: prevMonthStart, lte: prevMonthEnd } },
    }),
    // ── 7. Receivables — Σ max(0, totalPrice − confirmedPaid − writeOff) ──
    // Filtered by paymentState only to narrow the row set; the amount is
    // always the subtraction, never `paymentState`, because a write-off
    // marks an order FULLY_PAID while the cash is short.
    prisma.order.findMany({
      where: {
        ...LIVE_ORDERS,
        paymentState: { in: ['AWAITING_PAYMENT', 'PARTIALLY_PAID'] },
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
        ...LIVE_ORDERS,
        paymentState: { in: ['AWAITING_PAYMENT', 'PARTIALLY_PAID'] },
        placedAt: { lte: prevMonthEnd },
      },
      select: { totalPrice: true, confirmedPaid: true, writeOffAmount: true },
    }),
    // ── 9. Active customers — DISTINCT clients holding a live order. ──
    prisma.order.groupBy({
      by: ['clientId'],
      where: LIVE_ORDERS,
    }),
    // ── 10. Payment-state split of ORDER ROWS (disjoint buckets). ──
    prisma.order.groupBy({
      by: ['paymentState'],
      _count: { _all: true },
      where: LIVE_ORDERS,
    }),
    prisma.order.findMany({
      where: { ...LIVE_ORDERS, scheduledAt: { gte: todayStart, lte: todayEnd } },
      select: {
        id: true,
        orderNumber: true,
        totalArea: true,
        client: { select: { name: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    }),
    prisma.discrepancy.aggregate({
      _sum: { shortfall: true },
      where: { status: 'OPEN' },
    }),
    prisma.discrepancy.count({ where: { status: 'OPEN' } }),
    prisma.dispatch.findMany({
      where: { returnedAt: null },
      select: {
        expectedCollection: true,
        driver: { select: { id: true, name: true } },
      },
    }),
    prisma.order.findMany({
      where: { ...LIVE_ORDERS, scheduledAt: { gte: weekStart, lte: weekEnd } },
      select: { scheduledAt: true, totalArea: true },
    }),
    // City aggregation — pull each live order's client address +
    // confirmedPaid + a unique-client tally. Aggregate in-memory because
    // the city normalization happens in JS, not SQL. `confirmedPaid` is a
    // cash figure with no date, which is fine here: the city split is
    // all-time and has no time axis.
    prisma.order.findMany({
      where: LIVE_ORDERS,
      take: 10_000,
      select: {
        clientId: true,
        confirmedPaid: true,
        client: { select: { address: true } },
      },
    }),
    // Top customers by cash collected.
    prisma.order.groupBy({
      by: ['clientId'],
      _sum: { confirmedPaid: true },
      _count: { _all: true },
      where: LIVE_ORDERS,
      orderBy: { _sum: { confirmedPaid: 'desc' } },
      take: 5,
    }),
    // Rolling-12-month booked + order count for the hero chart.
    prisma.order.findMany({
      where: { ...LIVE_ORDERS, placedAt: { gte: twelveMonthsAgo } },
      select: { placedAt: true, totalPrice: true },
    }),
    // Rolling-12-month collected. Must come off the Payment table:
    // `Order.confirmedPaid` has no date, so it cannot be bucketed by when
    // the money actually arrived.
    prisma.payment.findMany({
      where: { ...COLLECTED_PAYMENTS, confirmedAt: { gte: twelveMonthsAgo } },
      select: { confirmedAt: true, amount: true },
    }),
    // Recent 6 orders for the bottom widget
    prisma.order.findMany({
      where: LIVE_ORDERS,
      orderBy: { placedAt: 'desc' },
      take: 6,
      select: {
        id: true,
        orderNumber: true,
        totalArea: true,
        totalPrice: true,
        totalBeams: true,
        totalBlocks: true,
        paymentState: true,
        client: { select: { name: true } },
      },
    }),
  ]);

  // ── Booked ──
  const bookedAllTime = Number(bookedAllTimeAgg._sum.totalPrice ?? 0);
  const orderCountAllTime = bookedAllTimeAgg._count._all;
  const bookedThisMonth = Number(bookedThisMonthAgg._sum.totalPrice ?? 0);
  const orderCountThisMonth = bookedThisMonthAgg._count._all;
  const bookedPrevMonth = Number(bookedPrevMonthAgg._sum.totalPrice ?? 0);
  const orderCountPrevMonth = bookedPrevMonthAgg._count._all;
  const bookedTrend = buildTrend(bookedThisMonth, bookedPrevMonth, 'positive');

  // ── Collected ──
  const collectedAllTime = Number(collectedAllTimeAgg._sum.amount ?? 0);
  const collectedThisMonth = Number(collectedThisMonthAgg._sum.amount ?? 0);
  const collectedPrevMonth = Number(collectedPrevMonthAgg._sum.amount ?? 0);
  const collectedTrend = buildTrend(collectedThisMonth, collectedPrevMonth, 'positive');

  // ── Average order value — BOOKED per order, same denominator as booked ──
  const avgAllTime = averageOrderValue(bookedAllTime, orderCountAllTime);
  const avgThisMonth = averageOrderValue(bookedThisMonth, orderCountThisMonth);
  const avgPrevMonth = averageOrderValue(bookedPrevMonth, orderCountPrevMonth);
  const avgOrderTrend = buildTrend(avgThisMonth, avgPrevMonth, 'positive');

  // ── Receivables ──
  let receivablesTotal = 0;
  let receivablesOrders = 0;
  for (const o of receivablesRows) {
    const due = outstandingAmount({
      totalPrice: Number(o.totalPrice),
      confirmedPaid: Number(o.confirmedPaid),
      writeOffAmount: Number(o.writeOffAmount),
    });
    if (due > 0) {
      receivablesTotal += due;
      receivablesOrders += 1;
    }
  }
  let receivablesPrev = 0;
  for (const o of receivablesPrevMonthRows) {
    receivablesPrev += outstandingAmount({
      totalPrice: Number(o.totalPrice),
      confirmedPaid: Number(o.confirmedPaid),
      writeOffAmount: Number(o.writeOffAmount),
    });
  }
  // Receivables: up = bad. Polarity NEGATIVE → up arrow renders red.
  const receivablesTrend = buildTrend(receivablesTotal, receivablesPrev, 'negative');

  // ── Active customers (distinct clients) + order-state split ──
  const activeCustomersCount = countDistinct(activeCustomerRows.map((r) => r.clientId));
  const ordersByPaymentState = { paid: 0, partial: 0, awaiting: 0 };
  for (const row of ordersByStateRows) {
    if (row.paymentState === 'FULLY_PAID') ordersByPaymentState.paid += row._count._all;
    else if (row.paymentState === 'PARTIALLY_PAID') ordersByPaymentState.partial += row._count._all;
    else if (row.paymentState === 'AWAITING_PAYMENT') ordersByPaymentState.awaiting += row._count._all;
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
  // For each canonical city, count UNIQUE clients and sum cash collected.
  const cityMap = new Map<string, { clients: Set<string>; collected: number }>();
  for (const row of cityRows) {
    const city = normalizeCity(row.client.address);
    const cur = cityMap.get(city) ?? { clients: new Set<string>(), collected: 0 };
    cur.clients.add(row.clientId);
    cur.collected += Number(row.confirmedPaid);
    cityMap.set(city, cur);
  }
  const cityList = Array.from(cityMap.entries())
    .map(([city, agg]) => ({
      city,
      count: agg.clients.size,
      collected: Math.round(agg.collected),
    }))
    .sort((a, b) => b.count - a.count);
  // Top 10 named + "Other" if non-zero.
  const named = cityList.filter((c) => c.city !== 'Other').slice(0, 10);
  const other = cityList.find((c) => c.city === 'Other');
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
      name: nameById.get(r.clientId) ?? '—',
      totalCollected: Math.round(Number(r._sum.confirmedPaid ?? 0)),
      orderCount: r._count._all,
    }))
    // Drop any rows with nothing collected — they're noise.
    .filter((c) => c.totalCollected > 0);

  // ── Week capacity strip ──
  const weekDays: Array<{ date: string; bookedM2: number; capacityM2: number }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    weekDays.push({
      date: dayKey(d),
      bookedM2: 0,
      capacityM2: CAPACITY_M2_PER_DAY,
    });
  }
  const weekIndex = new Map(weekDays.map((d, i) => [d.date, i]));
  for (const o of weekOrders) {
    const key = dayKey(new Date(o.scheduledAt));
    const i = weekIndex.get(key);
    if (i !== undefined) {
      weekDays[i]!.bookedM2 += Number(o.totalArea);
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

  // ── Rolling 12-month series ────────────────────────────────────────
  // Two separate series because they answer two different questions:
  // booked is bucketed by placedAt, collected by Payment.confirmedAt.
  const bookedMonthMap = accumulateByMonth(
    rollingOrders,
    (o) => o.placedAt,
    (o) => Number(o.totalPrice),
  );
  const collectedMonthMap = accumulateByMonth(
    rollingPayments,
    (p) => p.confirmedAt,
    (p) => Number(p.amount),
  );

  const window12 = monthWindow(now, 12);
  const bookedByMonth = window12.map((b) => ({
    month: b.label,
    booked: Math.round(bookedMonthMap.get(b.key)?.total ?? 0),
  }));
  const collectedByMonth = window12.map((b) => ({
    month: b.label,
    collected: Math.round(collectedMonthMap.get(b.key)?.total ?? 0),
  }));
  const ordersByMonth = window12.map((b) => ({
    month: b.label,
    count: bookedMonthMap.get(b.key)?.count ?? 0,
  }));

  // ── Recent 6 orders ────────────────────────────────────────────────
  const recentOrders = recentOrdersRaw.map((r) => ({
    id: r.id,
    orderNumber: r.orderNumber,
    clientName: r.client.name,
    primaryProductLabel:
      r.totalBeams > 0
        ? `${r.totalBeams} та балка · ${r.totalBlocks} та блок`
        : 'Преcaст',
    totalArea: Math.round(Number(r.totalArea) * 10) / 10,
    totalPrice: Math.round(Number(r.totalPrice)),
    paymentState: r.paymentState as 'FULLY_PAID' | 'PARTIALLY_PAID' | 'AWAITING_PAYMENT',
  }));

  const payload: DashboardPayload = {
    bookedThisMonth: {
      total: Math.round(bookedThisMonth),
      orderCount: orderCountThisMonth,
      periodStart: dayKey(monthStart),
      periodEnd: dayKey(monthEnd),
      trend: bookedTrend,
    },
    bookedAllTime: {
      total: Math.round(bookedAllTime),
      orderCount: orderCountAllTime,
    },
    collectedThisMonth: {
      total: Math.round(collectedThisMonth),
      paymentCount: collectedThisMonthAgg._count._all,
      periodStart: dayKey(monthStart),
      periodEnd: dayKey(monthEnd),
      trend: collectedTrend,
    },
    collectedAllTime: {
      total: Math.round(collectedAllTime),
      paymentCount: collectedAllTimeAgg._count._all,
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
    activeCustomers: { count: activeCustomersCount },
    ordersByPaymentState,
    todayDeliveries: {
      count: todayCount,
      totalArea: Math.round(todayArea * 10) / 10,
      date: dayKey(now),
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
    bookedByMonth,
    collectedByMonth,
    ordersByMonth,
    recentOrders,
  };

  return payload;
}
