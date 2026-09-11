import type { OrderStatus, OrderPaymentState } from "@prisma/client";

const STATUSES: OrderStatus[] = [
  "DRAFT", "PLACED", "IN_PRODUCTION", "LOADED", "DISPATCHED", "DELIVERED", "CANCELED",
];

/**
 * The CRM's `LIVE_ORDERS` rule (`src/lib/dashboard-data.ts`): `CANCELED` is money that never
 * happened, and `DRAFT` is reserved-and-unused. Neither owes anything, so neither belongs in a
 * payment count or behind the `payment=debt|paid` filter. The status chips are a different
 * question — they count every status, `CANCELED` included.
 */
export const NON_LIVE_ORDER_STATUSES: OrderStatus[] = ["CANCELED", "DRAFT"];

const NON_LIVE = new Set<OrderStatus>(NON_LIVE_ORDER_STATUSES);

type StatusGroup = { status: OrderStatus; _count: { _all: number }; _sum: { totalArea: unknown } };
/** Grouped by `paymentState` AND `status`: the status is what decides whether the row counts
 *  towards «Қарз»/«Тўланган» at all. */
type PaymentGroup = { paymentState: OrderPaymentState; status: OrderStatus; _count: { _all: number } };

export interface OrderFacets {
  byStatus: Record<OrderStatus, number>;
  /**
   * `debt` = every LIVE order that is not FULLY_PAID (the mobile's «Қарз» segment);
   * `paid` = every LIVE FULLY_PAID one. Canceled and draft orders are excluded from both — see
   * {@link NON_LIVE_ORDER_STATUSES}. Without that, Home's «13 буюртмада қолди» (which uses the
   * live rule) and the orders list's «Қарз 16» disagreed about the same database.
   */
  byPayment: { debt: number; paid: number };
  total: number;
  /** m², one decimal, like the dashboard's `todayDeliveries.totalArea`. */
  totalArea: number;
}

/**
 * Folds two `prisma.order.groupBy` results into the shape the Android orders list draws its chip
 * and segment counts from. Pure so it is unit-tested without a database; the route runs the
 * queries. `totalArea` arrives as Prisma `Decimal` (or a string in tests) and is summed via
 * `Number()` — it is an area, never money.
 */
export function facetsFrom(statusGroups: StatusGroup[], paymentGroups: PaymentGroup[]): OrderFacets {
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>;
  let total = 0;
  let area = 0;
  for (const g of statusGroups) {
    byStatus[g.status] = g._count._all;
    total += g._count._all;
    area += Number(g._sum.totalArea ?? 0);
  }
  let paid = 0;
  let debt = 0;
  for (const g of paymentGroups) {
    // A canceled order keeps whatever paymentState it had when it was canceled, so it would
    // otherwise land in «Қарз» (or «Тўланган») and be listed as owing money it does not owe.
    if (NON_LIVE.has(g.status)) continue;
    if (g.paymentState === "FULLY_PAID") paid += g._count._all;
    else debt += g._count._all;
  }
  return { byStatus, byPayment: { debt, paid }, total, totalArea: Math.round(area * 10) / 10 };
}
