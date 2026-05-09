/**
 * Wire-format types for the dashboard payload returned by GET
 * /api/dashboard. Mirrors the route handler's `DashboardPayload`
 * exactly. Cards consume these directly.
 */

export interface DashboardData {
  revenueThisMonth: {
    total: number;
    orderCount: number;
    periodStart: string;
    periodEnd: string;
  };
  revenueAllTime: {
    total: number;
    orderCount: number;
  };
  averageOrderValue: { thisMonth: number; allTime: number };
  outstandingReceivables: { total: number; orderCount: number };
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
