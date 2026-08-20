import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/dashboard-data', () => ({
  fetchDashboardData: vi.fn(),
}));

import { fetchDashboardData } from '@/lib/dashboard-data';
import { registerDashboardTools } from './dashboard';

const mockFetch = fetchDashboardData as ReturnType<typeof vi.fn>;

const MOCK_PAYLOAD = {
  bookedThisMonth: { total: 5_000_000, orderCount: 3, periodStart: '2026-07-01', periodEnd: '2026-07-31', trend: null },
  bookedAllTime: { total: 50_000_000, orderCount: 100 },
  collectedThisMonth: { total: 3_000_000, paymentCount: 4, periodStart: '2026-07-01', periodEnd: '2026-07-31', trend: null },
  collectedAllTime: { total: 48_000_000, paymentCount: 130 },
  averageOrderValue: { thisMonth: 1_666_667, allTime: 500_000, trend: null },
  outstandingReceivables: { total: 2_000_000, orderCount: 5, trend: null },
  activeCustomers: { count: 12 },
  ordersByPaymentState: { paid: 7, partial: 3, awaiting: 2 },
  todayDeliveries: { count: 2, totalArea: 96.5, date: '2026-07-17', orders: [] },
  openDiscrepancies: { count: 0, totalAmount: 0 },
  cashOnTheRoad: { total: 0, dispatchCount: 0, drivers: [] },
  ordersByRegion: [],
  topCustomers: [{ id: 'c1', name: 'Aziz', totalCollected: 3_000_000, orderCount: 5 }],
  weekCapacity: { utilizationPct: 30, days: [] },
  bookedByMonth: [],
  collectedByMonth: [],
  ordersByMonth: [],
  monthKeys: ['2026-07'],
  currentMonthIdx: 0,
  // Delivery-date basis: current month + one committed future month.
  deliveryBasis: {
    monthKeys: ['2026-07', '2026-08'],
    bookedByMonth: [
      { month: 'Июл', booked: 4_000_000 },
      { month: 'Авг', booked: 9_000_000 },
    ],
    collectedByMonth: [
      { month: 'Июл', collected: 3_000_000, paymentCount: 4 },
      { month: 'Авг', collected: 0, paymentCount: 0 },
    ],
    ordersByMonth: [
      { month: 'Июл', count: 2 },
      { month: 'Авг', count: 3 },
    ],
    dailyByDay: [],
    currentMonthIdx: 0,
  },
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
    expect(content[1].text).toContain('"bookedThisMonth"');
    expect(content[1].text).toContain('"collectedThisMonth"');
  });

  it('prose summary contains key metric labels', async () => {
    mockFetch.mockResolvedValue(MOCK_PAYLOAD);
    const { server, getHandler } = makeMockServer();
    registerDashboardTools(server as never);

    const result = await getHandler()({});
    const prose = (result as { content: Array<{ text: string }> }).content[0].text;

    expect(prose).toContain('Booked this month');
    expect(prose).toContain('Collected this month');
    expect(prose).toContain('receivables');
    expect(prose).toContain('UZS');
  });

  it('reports the delivery-date basis and the committed future months', async () => {
    mockFetch.mockResolvedValue(MOCK_PAYLOAD);
    const { server, getHandler } = makeMockServer();
    registerDashboardTools(server as never);

    const result = await getHandler()({});
    const prose = (result as { content: Array<{ text: string }> }).content[0].text;

    expect(prose).toContain('Booked by DELIVERY date');
    // The mutability of `scheduledAt` is stated, not implied.
    expect(prose).toContain('mutable');
    // Future work is reported as its own figure: 9 000 000 over 3 orders,
    // none of which appears in the placedAt-based numbers above it.
    expect(prose).toContain('committed in the next 1 month(s)');
    expect(prose).toContain('(3 orders)');
  });

  it('never labels a money figure as bare "revenue"', async () => {
    mockFetch.mockResolvedValue(MOCK_PAYLOAD);
    const { server, getHandler } = makeMockServer();
    registerDashboardTools(server as never);

    const result = await getHandler()({});
    const prose = (result as { content: Array<{ text: string }> }).content[0].text;

    expect(prose.toLowerCase()).not.toContain('revenue');
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
