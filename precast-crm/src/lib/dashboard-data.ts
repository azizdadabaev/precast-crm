import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { aggregateByRegion, type RegionRow } from '@/lib/dashboard-regions';
import { attributionDate } from '@/lib/payment-attribution';
import {
  accumulateLoaded,
  areaShares,
  beamsFromLoadedJson,
  hasRemainder,
  loadMonthKey,
  physicalCompletion,
  remainderAfterRecorded,
  roomBeamMeters,
  type LoadEvent,
  type LoadedVolume,
} from '@/lib/loaded-volume';
import {
  accumulateByMonth,
  averageOrderValue,
  buildTrend,
  countDistinct,
  currentMonthIndex,
  dayKey,
  deliveryMonthWindow,
  monthKey,
  monthWindow,
  outstandingAmount,
  DELIVERY_WINDOW_BACK,
  DELIVERY_WINDOW_FORWARD,
  ORDER_WINDOW_MONTHS,
  type Trend,
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
 * The same order series bucketed by `Order.scheduledAt` (DELIVERY DATE)
 * instead of `placedAt` (ORDER DATE), over a window that extends FORWARD.
 *
 * Why a second window: `scheduledAt` carries promised work into months
 * that have not happened yet. A trailing-12 window would drop every one of
 * them, which is the blind spot this basis exists to close — September can
 * read 0 booked while holding tens of millions of committed work.
 *
 * `scheduledAt` is MUTABLE: rescheduling an order moves its whole value
 * from one month to another, so a PAST month on this basis is not frozen
 * the way a `placedAt` month is. The UI says so whenever this basis is on.
 *
 * `collectedByMonth` here is deliberately still bucketed by
 * `Payment.confirmedAt` — cash arrival is a fact about MONEY, not about
 * when an order was promised, so it does NOT follow the basis toggle. It
 * is re-projected onto this window only so all four series stay
 * index-aligned and one month index can scope every card.
 *
 * All four series and `monthKeys` are index-aligned by construction: they
 * are all `.map()`ed off the one `deliveryMonthWindow(now)` array.
 */
export interface DeliveryBasisSeries {
  /** `YYYY-MM` keys, index-aligned with the series below. */
  monthKeys: string[];
  /** Σ Order.totalPrice over LIVE_ORDERS, bucketed by `scheduledAt`. */
  bookedByMonth: Array<{ month: string; booked: number }>;
  /** Σ CONFIRMED Payment.amount by `confirmedAt` — NOT by `scheduledAt`. */
  collectedByMonth: Array<{ month: string; collected: number; paymentCount: number }>;
  /** Live orders whose `scheduledAt` falls in the month. */
  ordersByMonth: Array<{ month: string; count: number }>;
  /** Sparse per-day scheduled activity for the hero chart's monthly view. */
  dailyByDay: Array<{ date: number; monthKey: string; orderCount: number; booked: number }>;
  /** Index of the month containing today — NOT the last index here. */
  currentMonthIdx: number;
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
  /**
   * Province (viloyat) ranking, ranked by ORDERS PLACED descending.
   * All-time over LIVE_ORDERS — it has no time axis, so it is never
   * scoped to the month picked in the hero chart. `booked` is
   * Σ Order.totalPrice for the province, NOT cash received.
   */
  ordersByRegion: RegionRow[];
  /** Ranked by cash collected, not by booked value. */
  topCustomers: Array<{ id: string; name: string; totalCollected: number; orderCount: number }>;
  weekCapacity: { utilizationPct: number; days: Array<{ date: string; bookedM2: number; capacityM2: number }> };
  // ── ORDER-DATE basis (default) — bucketed by `Order.placedAt`, trailing
  // 12 months. Index-aligned with each other and with `monthKeys`: all are
  // mapped off one `monthWindow(now, 12)` array. `placedAt` is immutable,
  // so these months are frozen once closed, and no order is ever placed in
  // the future — hence no forward months on this basis.
  bookedByMonth: Array<{ month: string; booked: number }>;
  /** `paymentCount` lets the Collected KPI card follow the selected month. */
  collectedByMonth: Array<{ month: string; collected: number; paymentCount: number }>;
  ordersByMonth: Array<{ month: string; count: number }>;
  /** `YYYY-MM` keys index-aligned with the three series above. */
  monthKeys: string[];
  /** Index of the current month in those series (their last index). */
  currentMonthIdx: number;
  /** The same figures bucketed by DELIVERY date, over a forward window. */
  deliveryBasis: DeliveryBasisSeries;
  /**
   * Product that physically left the yard, per calendar month, keyed by
   * `YYYY-MM`. Independent of the order/delivery basis toggle: loading is its
   * own event with its own date, so the card looks itself up by month key.
   */
  loadedVolumeByMonth: Array<{ monthKey: string } & LoadedVolume>;
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

/**
 * Prisma `where` fragment selecting payments whose ATTRIBUTION date falls in a
 * window — `paidOn` when one was recorded, `confirmedAt` otherwise.
 *
 * Expressed as an OR because SQL cannot index a COALESCE through Prisma's
 * filter API. The second arm carries `paidOn: null`, which is what keeps the
 * two arms disjoint: without it a row with an early `paidOn` and a late
 * `confirmedAt` would match both and be counted twice.
 *
 * `end` of null means "no upper bound" (the rolling-window case).
 */
function paidWindow(start: Date, end: Date | null): Prisma.PaymentWhereInput {
  const range = end ? { gte: start, lte: end } : { gte: start };
  return {
    OR: [
      { paidOn: range },
      { paidOn: null, confirmedAt: range },
    ],
  };
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
  // Delivery-date window — reaches FORWARD past today, because scheduled
  // work lives in months that have not happened yet. Both bounds are LOCAL
  // instants: `scheduledAt` stores a local date as the previous day 19:00Z,
  // so a UTC-anchored bound would slice a day off each end.
  const deliveryWindowStart = new Date(
    now.getFullYear(), now.getMonth() - DELIVERY_WINDOW_BACK, 1, 0, 0, 0, 0,
  );
  const deliveryWindowEnd = new Date(
    now.getFullYear(), now.getMonth() + DELIVERY_WINDOW_FORWARD + 1, 0, 23, 59, 59, 999,
  );
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
    regionRows,
    topClientsRows,
    rollingOrders,
    rollingPayments,
    scheduledOrders,
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
      where: { ...COLLECTED_PAYMENTS, ...paidWindow(monthStart, monthEnd) },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: { ...COLLECTED_PAYMENTS, ...paidWindow(prevMonthStart, prevMonthEnd) },
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
    // Region aggregation — pull each live order's client address +
    // booked value + client id. Aggregated in-memory because resolving
    // an address to a viloyat happens in JS (both alphabets), not SQL.
    // All-time: the ranking has no time axis.
    prisma.order.findMany({
      where: LIVE_ORDERS,
      take: 10_000,
      select: {
        clientId: true,
        totalPrice: true,
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
      where: { ...COLLECTED_PAYMENTS, ...paidWindow(twelveMonthsAgo, null) },
      select: { confirmedAt: true, paidOn: true, amount: true },
    }),
    // Delivery-date basis: the same live orders keyed by `scheduledAt`.
    // A separate query from `rollingOrders` because the two windows differ
    // (this one reaches into the future) and one order can sit in a
    // different month under each basis — that divergence is the point.
    prisma.order.findMany({
      where: {
        ...LIVE_ORDERS,
        scheduledAt: { gte: deliveryWindowStart, lte: deliveryWindowEnd },
      },
      select: { scheduledAt: true, totalPrice: true },
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

  // ── Orders by region (viloyat) ──
  // Top 8 provinces by orders placed, everything else folded into
  // «Бошқа». Unmatched addresses are bucketed, never dropped.
  const ordersByRegion = aggregateByRegion(
    regionRows.map((r) => ({
      clientId: r.clientId,
      address: r.client.address,
      booked: Number(r.totalPrice),
    })),
    8,
  );

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
    // `paidOn` when the operator recorded when the customer ACTUALLY paid,
    // else `confirmedAt` — which is every historical row, so their months
    // do not move. See src/lib/payment-attribution.ts
    (p) => attributionDate(p),
    (p) => Number(p.amount),
  );

  // ── Loaded volume — what physically left the yard, by month ─────────
  //
  // Three sources, applied in this order so nothing is counted twice:
  //   1. SPLIT SHIPMENTS — actual counted quantities per truck.
  //   2. SINGLE TRUCK    — `Order.loadedAt` with no quantities recorded,
  //      which by definition means the whole order went on one truck.
  //   3. DELIVERED REMAINDER — loading paperwork is often incomplete (the
  //      operator logs the first truck and forgets the rest; filler blocks
  //      are not photographed the way T-beams are). Once an order is
  //      DELIVERED the whole order demonstrably shipped, so the unrecorded
  //      BALANCE is added. Taking the difference, not replacing the figures,
  //      is what preserves accurate truck records where they exist.
  //
  // Sources 1 and 2 are mutually exclusive in the data — no order that uses
  // shipments also sets `Order.loadedAt`.
  const loadWindowStart = new Date(
    Math.min(twelveMonthsAgo.getTime(), deliveryWindowStart.getTime()),
  );
  const loadableOrders = await prisma.order.findMany({
    where: {
      ...LIVE_ORDERS,
      OR: [
        { loadedAt: { gte: loadWindowStart } },
        { deliveredAt: { gte: loadWindowStart } },
        { shipments: { some: { loadedAt: { gte: loadWindowStart } } } },
        // A truck DELIVERED in the window completes its order even if it
        // loaded earlier, so the remainder must be reachable by that date too.
        { shipments: { some: { deliveredAt: { gte: loadWindowStart } } } },
      ],
    },
    select: {
      id: true,
      status: true,
      loadedAt: true,
      deliveredAt: true,
      scheduledAt: true,
      totalArea: true,
      totalBlocks: true,
      totalBeams: true,
      project: { select: { calculations: { select: { beamCount: true, beamLength: true } } } },
      // EVERY shipment, not just loaded ones: completion asks whether all of
      // them are delivered, and a shipment that was never loaded still counts
      // against that. Loaded ones are filtered out in code below.
      shipments: {
        orderBy: { number: 'asc' },
        select: {
          status: true,
          loadedAt: true,
          deliveredAt: true,
          loadedBeams: true,
          loadedBlocks: true,
        },
      },
    },
  });

  const loadEvents: LoadEvent[] = [];
  for (const o of loadableOrders) {
    const rooms = o.project.calculations.map((c) => ({
      beamCount: c.beamCount,
      beamLength: Number(c.beamLength),
    }));
    // The owner's formula: Σ(beamCount × beamLength) over the order's rooms.
    const orderTotals = {
      blocks: o.totalBlocks,
      beamCount: o.totalBeams,
      beamMeters: roomBeamMeters(rooms),
      area: Number(o.totalArea),
    };

    const recorded = { blocks: 0, beamCount: 0, beamMeters: 0, area: 0 };

    // Only trucks that were actually loaded carry quantities; the rest are
    // still needed above, to judge whether the order is complete.
    const loadedShipments = o.shipments.filter((s) => s.loadedAt);

    if (loadedShipments.length > 0) {
      const per = loadedShipments.map((s) => {
        const beams = beamsFromLoadedJson(s.loadedBeams);
        return { blocks: Number(s.loadedBlocks ?? 0), ...beams };
      });
      // The order's own m² cell, split across its trucks so the parts add
      // back to exactly that figure — shipments never record area.
      const shares = areaShares(orderTotals.area, per);
      loadedShipments.forEach((s, i) => {
        const e: LoadEvent = {
          monthKey: loadMonthKey(s.loadedAt as Date),
          orderId: o.id,
          blocks: per[i].blocks,
          beamCount: per[i].count,
          beamMeters: per[i].meters,
          area: shares[i] ?? 0,
        };
        recorded.blocks += e.blocks;
        recorded.beamCount += e.beamCount;
        recorded.beamMeters += e.beamMeters;
        recorded.area += e.area;
        loadEvents.push(e);
      });
    } else if (o.loadedAt) {
      loadEvents.push({ monthKey: loadMonthKey(o.loadedAt), orderId: o.id, ...orderTotals });
      recorded.blocks = orderTotals.blocks;
      recorded.beamCount = orderTotals.beamCount;
      recorded.beamMeters = orderTotals.beamMeters;
      recorded.area = orderTotals.area;
    }

    // Physically complete, NOT `status === 'DELIVERED'`. That status is gated
    // on a zero balance, so a split order whose every truck has been delivered
    // stays at DISPATCHED while unpaid and its unrecorded balance would never
    // be counted at all — three orders and 1 653 blocks on prod. Delivery and
    // payment are different facts; volume follows the goods.
    const completedAt = physicalCompletion({
      status: o.status,
      deliveredAt: o.deliveredAt,
      loadedAt: o.loadedAt,
      scheduledAt: o.scheduledAt,
      shipments: o.shipments,
    });
    if (completedAt) {
      const rest = remainderAfterRecorded(orderTotals, recorded);
      if (hasRemainder(rest)) {
        const when = completedAt;
        loadEvents.push({ monthKey: loadMonthKey(when), orderId: o.id, ...rest });
      }
    }
  }
  const loadedMap = accumulateLoaded(loadEvents);

  const window12 = monthWindow(now, ORDER_WINDOW_MONTHS);
  const bookedByMonth = window12.map((b) => ({
    month: b.label,
    booked: Math.round(bookedMonthMap.get(b.key)?.total ?? 0),
  }));
  const collectedByMonth = window12.map((b) => ({
    month: b.label,
    collected: Math.round(collectedMonthMap.get(b.key)?.total ?? 0),
    paymentCount: collectedMonthMap.get(b.key)?.count ?? 0,
  }));
  const ordersByMonth = window12.map((b) => ({
    month: b.label,
    count: bookedMonthMap.get(b.key)?.count ?? 0,
  }));

  // ── Delivery-date basis ────────────────────────────────────────────
  // The same money filed under `scheduledAt` instead of `placedAt`, over a
  // window running DELIVERY_WINDOW_FORWARD months past today so committed
  // future work is visible at all. Every series below is mapped off the one
  // `deliveryWindow` array — that is what keeps them index-aligned, and
  // HeroChart / FinancialKPIs both select by index.
  const deliveryWindow = deliveryMonthWindow(now);
  const scheduledMonthMap = accumulateByMonth(
    scheduledOrders,
    (o) => o.scheduledAt,
    (o) => Number(o.totalPrice),
  );

  // Sparse per-day scheduled activity, in the same shape the hero chart
  // already consumes from /api/dashboard/monthly-revenue. Keys are LOCAL.
  const deliveryDayMap = new Map<
    string,
    { date: number; monthKey: string; orderCount: number; booked: number }
  >();
  for (const o of scheduledOrders) {
    const d = new Date(o.scheduledAt);
    const key = dayKey(d);
    let bucket = deliveryDayMap.get(key);
    if (!bucket) {
      bucket = {
        date: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(),
        monthKey: monthKey(d),
        orderCount: 0,
        booked: 0,
      };
      deliveryDayMap.set(key, bucket);
    }
    bucket.orderCount += 1;
    bucket.booked += Number(o.totalPrice);
  }

  const deliveryBasis: DeliveryBasisSeries = {
    monthKeys: deliveryWindow.map((b) => b.key),
    bookedByMonth: deliveryWindow.map((b) => ({
      month: b.label,
      booked: Math.round(scheduledMonthMap.get(b.key)?.total ?? 0),
    })),
    // Still `Payment.confirmedAt` — cash does not move when an order is
    // rescheduled, so this series does NOT follow the basis toggle. It is
    // re-projected onto this window purely to stay index-aligned.
    collectedByMonth: deliveryWindow.map((b) => ({
      month: b.label,
      collected: Math.round(collectedMonthMap.get(b.key)?.total ?? 0),
      paymentCount: collectedMonthMap.get(b.key)?.count ?? 0,
    })),
    ordersByMonth: deliveryWindow.map((b) => ({
      month: b.label,
      count: scheduledMonthMap.get(b.key)?.count ?? 0,
    })),
    dailyByDay: Array.from(deliveryDayMap.values())
      .sort((a, b) => a.date - b.date)
      .map((d) => ({ ...d, booked: Math.round(d.booked) })),
    currentMonthIdx: currentMonthIndex(deliveryWindow, now),
  };

  // Keyed by `YYYY-MM`, not by index: the loading month is its own axis and
  // must stay correct whichever basis (and therefore whichever window) the
  // dashboard is showing. The client looks this up by the selected month key.
  const loadedMonthKeys = Array.from(
    new Set([...window12.map((b) => b.key), ...deliveryWindow.map((b) => b.key)]),
  ).sort();
  const loadedVolumeByMonth = loadedMonthKeys.map((key) => {
    const v = loadedMap.get(key);
    return {
      monthKey: key,
      blocks: v?.blocks ?? 0,
      beamCount: v?.beamCount ?? 0,
      // One decimal: metres and m² are measurements, not currency.
      beamMeters: Math.round((v?.beamMeters ?? 0) * 10) / 10,
      area: Math.round((v?.area ?? 0) * 10) / 10,
      orderCount: v?.orderCount ?? 0,
    };
  });

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
    ordersByRegion,
    topCustomers,
    weekCapacity: { utilizationPct, days: weekDays },
    bookedByMonth,
    collectedByMonth,
    ordersByMonth,
    monthKeys: window12.map((b) => b.key),
    currentMonthIdx: currentMonthIndex(window12, now),
    deliveryBasis,
    loadedVolumeByMonth,
    recentOrders,
  };

  return payload;
}
