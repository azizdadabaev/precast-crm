import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    client: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { listClients, getClient } from './clients';

const mockPrisma = prisma as unknown as {
  client: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
};

const SAMPLE_CLIENT = {
  id: 'c1',
  name: 'Azizbek Dadabaev',
  phone: '998901234567',
  address: 'Toshkent',
  language: 'UZ',
  source: null,
  _count: { orders: 3, deals: 1 },
};

describe('listClients', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns clients capped at 50', async () => {
    mockPrisma.client.findMany.mockResolvedValue([SAMPLE_CLIENT]);
    const result = await listClients({});
    expect(result).toHaveLength(1);
    const callArgs = mockPrisma.client.findMany.mock.calls[0][0];
    expect(callArgs.take).toBe(50);
  });

  it('passes q search to prisma where', async () => {
    mockPrisma.client.findMany.mockResolvedValue([]);
    await listClients({ q: 'Aziz' });
    const whereArg = mockPrisma.client.findMany.mock.calls[0][0].where;
    expect(whereArg.OR).toBeDefined();
  });
});

describe('getClient', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns client with recent orders when found', async () => {
    mockPrisma.client.findUnique.mockResolvedValue({ ...SAMPLE_CLIENT, orders: [], deals: [] });
    const result = await getClient('c1');
    expect(result?.name).toBe('Azizbek Dadabaev');
  });

  it('returns null when client not found', async () => {
    mockPrisma.client.findUnique.mockResolvedValue(null);
    const result = await getClient('notexist');
    expect(result).toBeNull();
  });
});
