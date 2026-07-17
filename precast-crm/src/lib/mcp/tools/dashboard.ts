import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fetchDashboardData, DashboardPayload } from '@/lib/dashboard-data';

function formatSummary(d: DashboardPayload): string {
  const fmt = (n: number) => n.toLocaleString('ru-RU') + ' UZS';
  const lines = [
    `Revenue this month: ${fmt(d.revenueThisMonth.total)} (${d.revenueThisMonth.orderCount} orders)`,
    `All-time revenue: ${fmt(d.revenueAllTime.total)} (${d.revenueAllTime.orderCount} orders)`,
    `Avg order value: ${fmt(d.averageOrderValue.thisMonth)} this month / ${fmt(d.averageOrderValue.allTime)} all-time`,
    `Outstanding receivables: ${fmt(d.outstandingReceivables.total)} across ${d.outstandingReceivables.orderCount} order(s)`,
    `Active customers: ${d.activeCustomers.count} (${d.activeCustomers.breakdown.paid} paid, ${d.activeCustomers.breakdown.partial} partial, ${d.activeCustomers.breakdown.awaiting} awaiting)`,
    `Today's deliveries: ${d.todayDeliveries.count} orders / ${d.todayDeliveries.totalArea} m²`,
    `Open discrepancies: ${d.openDiscrepancies.count} (${fmt(d.openDiscrepancies.totalAmount)})`,
    `Cash on road: ${fmt(d.cashOnTheRoad.total)} in ${d.cashOnTheRoad.dispatchCount} dispatch(es)`,
    `Week utilization: ${d.weekCapacity.utilizationPct}%`,
  ];
  if (d.topCustomers.length > 0) {
    lines.push(`Top customers: ${d.topCustomers.map((c) => `${c.name} (${fmt(c.totalRevenue)})`).join(', ')}`);
  }
  return lines.join('\n');
}

export function registerDashboardTools(server: McpServer): void {
  server.tool(
    'get_dashboard',
    "Full dashboard snapshot: revenue, receivables, today's deliveries, week capacity, top customers, and 12-month chart data. Returns the same payload as GET /api/dashboard.",
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
