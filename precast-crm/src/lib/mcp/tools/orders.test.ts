import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { listOrders, getOrder } from './orders';

const mockPrisma = prisma as unknown as {
  order: {
    count: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
};

const SAMPLE_ORDER = {
  id: 'ord1',
  orderNumber: '2026-07-0001',
  status: 'PLACED',
  paymentState: 'AWAITING_PAYMENT',
  totalPrice: '1200000',
  totalArea: '48.5',
  confirmedPaid: '0',
  scheduledAt: new Date('2026-07-20'),
  placedAt: new Date('2026-07-16'),
  deliveredAt: null,
  client: { name: 'Azizbek', phone: '998901234567' },
};

describe('listOrders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns paginated result', async () => {
    mockPrisma.order.count.mockResolvedValue(1);
    mockPrisma.order.findMany.mockResolvedValue([SAMPLE_ORDER]);

    const result = await listOrders({});
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].orderNumber).toBe('2026-07-0001');
    expect(result.totalPages).toBe(1);
  });

  it('clamps pageSize to max 50', async () => {
    mockPrisma.order.count.mockResolvedValue(0);
    mockPrisma.order.findMany.mockResolvedValue([]);

    await listOrders({ pageSize: 999 });
    const callArgs = mockPrisma.order.findMany.mock.calls[0][0];
    expect(callArgs.take).toBe(50);
  });

  it('filters by status when provided', async () => {
    mockPrisma.order.count.mockResolvedValue(0);
    mockPrisma.order.findMany.mockResolvedValue([]);

    await listOrders({ status: 'DELIVERED' });
    const whereArg = mockPrisma.order.findMany.mock.calls[0][0].where;
    expect(whereArg.status).toBe('DELIVERED');
  });
});

describe('getOrder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the order when found', async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ ...SAMPLE_ORDER, payments: [], shipments: [], events: [] });
    const result = await getOrder('ord1');
    expect(result?.orderNumber).toBe('2026-07-0001');
  });

  it('returns null when order not found', async () => {
    mockPrisma.order.findUnique.mockResolvedValue(null);
    const result = await getOrder('doesnotexist');
    expect(result).toBeNull();
  });
});
