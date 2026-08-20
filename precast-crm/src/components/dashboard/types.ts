/**
 * Wire-format types for the dashboard payload returned by GET
 * /api/dashboard. Mirrors `DashboardPayload` in `@/lib/dashboard-data`
 * exactly. Cards consume these directly.
 *
 * The money side is split into two metrics that must never be collapsed
 * into one "revenue" number — they differ by the outstanding receivable:
 *   • booked    «Буюртма қилинган · Booked»  Σ Order.totalPrice by placedAt
 *   • collected «Тушган пул · Collected»     Σ CONFIRMED Payment.amount by confirmedAt
 *
 * Booked (and everything derived from it) can be filed under either of the
 * order's two dates — see `DateBasis` in `@/lib/dashboard-metrics`. The
 * order-date series live at the top level; the delivery-date series live
 * under `deliveryBasis` and cover a window that reaches into the future.
 * Collected never changes basis: cash is dated by `Payment.confirmedAt`
 * whichever way the toggle is set.
 */

export interface Trend {
  /** Whole-percent delta vs the previous period. Sign-preserving. */
  deltaPct: number;
  /** "flat" when |delta| < 1% so noise doesn't trigger green/red flashing. */
  direction: "up" | "down" | "flat";
  /** Whether an up arrow is good (booked/collected) or bad (receivables). */
  polarity: "positive" | "negative";
}

export interface DashboardData {
  /** «Буюртма қилинган · Booked» — what was SOLD this month. */
  bookedThisMonth: {
    total: number;
    orderCount: number;
    periodStart: string;
    periodEnd: string;
    trend: Trend | null;
  };
  bookedAllTime: {
    total: number;
    orderCount: number;
  };
  /** «Тушган пул · Collected» — cash confirmed received this month. */
  collectedThisMonth: {
    total: number;
    paymentCount: number;
    periodStart: string;
    periodEnd: string;
    trend: Trend | null;
  };
  collectedAllTime: {
    total: number;
    paymentCount: number;
  };
  /** Booked value per order (Σ totalPrice ÷ order count). */
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
  /** DISTINCT clients holding at least one live order. */
  activeCustomers: {
    count: number;
  };
  /** ORDER ROWS per payment state — disjoint buckets, they sum to the whole. */
  ordersByPaymentState: { paid: number; partial: number; awaiting: number };
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
  /**
   * Province (viloyat) ranking — all-time over live orders, ranked by
   * ORDERS PLACED descending. `booked` is Σ Order.totalPrice for the
   * province, not cash received. `region` is the canonical Latin name
   * (stable key), `regionUz` the Cyrillic label. Everything that
   * matched no province sits in the «Бошқа» row.
   */
  ordersByRegion: Array<{
    region: string;
    regionUz: string;
    orderCount: number;
    clientCount: number;
    booked: number;
  }>;
  topCustomers: Array<{
    id: string;
    name: string;
    totalCollected: number;
    orderCount: number;
  }>;
  weekCapacity: {
    utilizationPct: number;
    days: Array<{ date: string; bookedM2: number; capacityM2: number }>;
  };
  /**
   * ORDER-DATE basis (default) — bucketed by `Order.placedAt`, trailing 12
   * months, index-aligned with `collectedByMonth`, `ordersByMonth` and
   * `monthKeys`. `placedAt` is immutable, so a closed month never moves.
   */
  bookedByMonth: Array<{ month: string; booked: number }>;
  /** `paymentCount` lets the Collected KPI card follow the selected month. */
  collectedByMonth: Array<{ month: string; collected: number; paymentCount: number }>;
  ordersByMonth: Array<{ month: string; count: number }>;
  /** `YYYY-MM` keys index-aligned with the three series above. */
  monthKeys: string[];
  /** Index of the current month in those series (their last index). */
  currentMonthIdx: number;
  /**
   * DELIVERY-DATE basis — the same orders bucketed by `Order.scheduledAt`
   * over a FORWARD-looking window (trailing 9 + current + next 3), so
   * committed future work is visible instead of reading as zero.
   * `scheduledAt` is MUTABLE: rescheduling moves an order between months,
   * so past figures on this basis can still change — the UI says so.
   * `collectedByMonth` here is still bucketed by `Payment.confirmedAt`; it
   * is only re-projected onto this window to stay index-aligned.
   */
  deliveryBasis: {
    monthKeys: string[];
    bookedByMonth: Array<{ month: string; booked: number }>;
    collectedByMonth: Array<{ month: string; collected: number; paymentCount: number }>;
    ordersByMonth: Array<{ month: string; count: number }>;
    dailyByDay: Array<{ date: number; monthKey: string; orderCount: number; booked: number }>;
    /** Index of the month containing today — NOT the last index here. */
    currentMonthIdx: number;
  };
  /**
   * Product that physically left the yard, per calendar month.
   *
   * Keyed by `YYYY-MM` rather than positioned by index because loading has its
   * own date and its own axis: it must resolve to the same calendar month
   * whichever basis the dashboard is currently showing.
   *
   * `blocks`, `beamCount` and `beamMeters` are counted quantities. `area` is
   * each order's own m² figure, apportioned across its trucks when an order
   * shipped on more than one.
   */
  loadedVolumeByMonth: Array<{
    monthKey: string;
    blocks: number;
    beamCount: number;
    beamMeters: number;
    area: number;
    orderCount: number;
  }>;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    clientName: string;
    primaryProductLabel: string;
    totalArea: number;
    totalPrice: number;
    paymentState: "FULLY_PAID" | "PARTIALLY_PAID" | "AWAITING_PAYMENT";
  }>;
}
