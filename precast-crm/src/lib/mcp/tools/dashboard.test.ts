import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/dashboard-data', () => ({
  fetchDashboardData: vi.fn(),
}));

import { fetchDashboardData } from '@/lib/dashboard-data';
import { registerDashboardTools } from './dashboard';

const mockFetch = fetchDashboardData as ReturnType<typeof vi.fn>;

const MOCK_PAYLOAD = {
  revenueThisMonth: { total: 5_000_000, orderCount: 3, periodStart: '2026-07-01', periodEnd: '2026-07-31', trend: null },
  revenueAllTime: { total: 50_000_000, orderCount: 100 },
  averageOrderValue: { thisMonth: 1_666_666, allTime: 500_000, trend: null },
  outstandingReceivables: { total: 2_000_000, orderCount: 5, trend: null },
  activeCustomers: { count: 12, breakdown: { paid: 7, partial: 3, awaiting: 2 } },
  todayDeliveries: { count: 2, totalArea: 96.5, date: '2026-07-17', orders: [] },
  openDiscrepancies: { count: 0, totalAmount: 0 },
  cashOnTheRoad: { total: 0, dispatchCount: 0, drivers: [] },
  customersByCity: [],
  topCustomers: [{ id: 'c1', name: 'Aziz', totalRevenue: 3_000_000, orderCount: 5 }],
  weekCapacity: { utilizationPct: 30, days: [] },
  revenueByMonth: [],
  ordersByMonth: [],
  recentOrders: [],
};

function makeMockServer() {
  let capturedHandler: ((args: Record<string, never>) => Promise<unknown>) | undefined;
  return {
    server: {
      tool: (_name: string, _desc: string, _schema: object, handler: typeof capturedHandler) => {
        capturedHandler = handler as typeof capturedHandler;
      },
    },
    getHandler: () => capturedHandler!,
  };
}

describe('get_dashboard tool', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns two content blocks when fetchDashboardData resolves', async () => {
    mockFetch.mockResolvedValue(MOCK_PAYLOAD);
    const { server, getHandler } = makeMockServer();
    registerDashboardTools(server as never);

    const result = await getHandler()({});

    expect(mockFetch).toHaveBeenCalledOnce();
    const content = (result as { content: Array<{ type: string; text: string }> }).content;
    expect(content).toHaveLength(2);
    expect(content[0].type).toBe('text');
    expect(content[1].type).toBe('text');
    expect(content[1].text).toContain('```json');
    expect(content[1].text).toContain('"revenueThisMonth"');
  });

  it('prose summary contains key metric labels', async () => {
    mockFetch.mockResolvedValue(MOCK_PAYLOAD);
    const { server, getHandler } = makeMockServer();
    registerDashboardTools(server as never);

    const result = await getHandler()({});
    const prose = (result as { content: Array<{ text: string }> }).content[0].text;

    expect(prose).toContain('Revenue this month');
    expect(prose).toContain('receivables');
    expect(prose).toContain('UZS');
  });

  it('includes top customer names in prose', async () => {
    mockFetch.mockResolvedValue(MOCK_PAYLOAD);
    const { server, getHandler } = makeMockServer();
    registerDashboardTools(server as never);

    const result = await getHandler()({});
    const prose = (result as { content: Array<{ text: string }> }).content[0].text;

    expect(prose).toContain('Aziz');
  });
});
