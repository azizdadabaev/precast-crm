/**
 * Wire-format types for the dashboard payload returned by GET
 * /api/dashboard. Mirrors the route handler's `DashboardPayload`
 * exactly. Cards consume these directly.
 */

export interface Trend {
  /** Whole-percent delta vs the previous period. Sign-preserving. */
  deltaPct: number;
  /** "flat" when |delta| < 1% so noise doesn't trigger green/red flashing. */
  direction: "up" | "down" | "flat";
  /** Whether an up arrow is good (revenue) or bad (receivables). */
  polarity: "positive" | "negative";
}

export interface DashboardData {
  revenueThisMonth: {
    total: number;
    orderCount: number;
    periodStart: string;
    periodEnd: string;
    trend: Trend | null;
  };
  revenueAllTime: {
    total: number;
    orderCount: number;
  };
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
  revenueByMonth: Array<{ month: string; revenue: number }>;
  ordersByMonth: Array<{ month: string; count: number }>;
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
