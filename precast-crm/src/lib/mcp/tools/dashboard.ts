import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fetchDashboardData, DashboardPayload } from '@/lib/dashboard-data';

function formatSummary(d: DashboardPayload): string {
  const fmt = (n: number) => n.toLocaleString('ru-RU') + ' UZS';
  // "Booked" and "Collected" are named explicitly and never collapsed
  // into "revenue" — they differ by the outstanding receivable.
  const lines = [
    `Booked this month (orders placed, sum of totalPrice): ${fmt(d.bookedThisMonth.total)} (${d.bookedThisMonth.orderCount} orders)`,
    `Booked all-time: ${fmt(d.bookedAllTime.total)} (${d.bookedAllTime.orderCount} orders)`,
    `Collected this month (confirmed payments, by confirmedAt): ${fmt(d.collectedThisMonth.total)} (${d.collectedThisMonth.paymentCount} payments)`,
    `Collected all-time: ${fmt(d.collectedAllTime.total)} (${d.collectedAllTime.paymentCount} payments)`,
    `Avg order value (booked per order): ${fmt(d.averageOrderValue.thisMonth)} this month / ${fmt(d.averageOrderValue.allTime)} all-time`,
    `Outstanding receivables: ${fmt(d.outstandingReceivables.total)} across ${d.outstandingReceivables.orderCount} order(s)`,
    `Active customers (distinct clients): ${d.activeCustomers.count}`,
    `Orders by payment state: ${d.ordersByPaymentState.paid} paid, ${d.ordersByPaymentState.partial} partial, ${d.ordersByPaymentState.awaiting} awaiting`,
    `Today's deliveries: ${d.todayDeliveries.count} orders / ${d.todayDeliveries.totalArea} m²`,
    `Open discrepancies: ${d.openDiscrepancies.count} (${fmt(d.openDiscrepancies.totalAmount)})`,
    `Cash on road: ${fmt(d.cashOnTheRoad.total)} in ${d.cashOnTheRoad.dispatchCount} dispatch(es)`,
    `Week utilization: ${d.weekCapacity.utilizationPct}%`,
  ];
  if (d.topCustomers.length > 0) {
    lines.push(`Top customers by cash collected: ${d.topCustomers.map((c) => `${c.name} (${fmt(c.totalCollected)})`).join(', ')}`);
  }
  return lines.join('\n');
}

export function registerDashboardTools(server: McpServer): void {
  server.tool(
    'get_dashboard',
    "Full dashboard snapshot: booked value (orders placed), collected cash (confirmed payments), receivables, today's deliveries, week capacity, top customers, and 12-month chart data. Returns the same payload as GET /api/dashboard.",
    {},
    async () => {
      try {
        const data = await fetchDashboardData();
        return {
          content: [
            { type: 'text' as const, text: formatSummary(data) },
            { type: 'text' as const, text: '```json\n' + JSON.stringify(data, null, 2) + '\n```' },
          ],
        };
      } catch (err) {
        console.error('[MCP get_dashboard]', err);
        return { content: [{ type: 'text' as const, text: 'Database error — please try again.' }] };
      }
    },
  );
}
