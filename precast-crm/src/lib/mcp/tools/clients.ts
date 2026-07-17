import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export async function listClients(params: { q?: string; phone?: string }) {
  const where: Record<string, unknown> = {};

  if (params.q || params.phone) {
    const conditions: unknown[] = [];
    if (params.q) {
      conditions.push(
        { name: { contains: params.q, mode: 'insensitive' } },
        { address: { contains: params.q, mode: 'insensitive' } },
      );
    }
    if (params.phone) {
      conditions.push({ phone: { contains: params.phone } });
    }
    where.OR = conditions;
  }

  return prisma.client.findMany({
    where,
    take: 50,
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      language: true,
      source: true,
      _count: { select: { orders: true, deals: true } },
    },
  });
}

export async function getClient(clientId: string) {
  return prisma.client.findUnique({
    where: { id: clientId },
    include: {
      orders: {
        orderBy: { placedAt: 'desc' },
        take: 20,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalPrice: true,
          paymentState: true,
          placedAt: true,
          deliveredAt: true,
        },
      },
      deals: {
        where: { status: 'OPEN' },
        select: { id: true, stage: true, value: true },
      },
      _count: { select: { orders: true, deals: true } },
    },
  });
}

export function registerClientTools(server: McpServer): void {
  server.tool(
    'list_clients',
    'Search clients by name or phone. Returns up to 50 results.',
    {
      q: z.string().optional().describe('Name or address substring search'),
      phone: z.string().optional().describe('Phone number prefix or exact match'),
    },
    async (params) => {
      try {
        const clients = await listClients(params);
        const summary = `Found ${clients.length} client(s).`;
        return {
          content: [
            { type: 'text' as const, text: summary },
            { type: 'text' as const, text: '```json\n' + JSON.stringify(clients, null, 2) + '\n```' },
          ],
        };
      } catch (err) {
        console.error('[MCP list_clients]', err);
        return { content: [{ type: 'text' as const, text: 'Database error — please try again.' }] };
      }
    },
  );

  server.tool(
    'get_client',
    'Get full client detail including recent 20 orders and open deals.',
    {
      clientId: z.string().describe('The client ID (uuid)'),
    },
    async ({ clientId }) => {
      try {
        const client = await getClient(clientId);
        if (!client) {
          return { content: [{ type: 'text' as const, text: `Client ${clientId} not found.` }] };
        }
        const summary = `${client.name} — ${client.phone} — ${client._count.orders} order(s)`;
        return {
          content: [
            { type: 'text' as const, text: summary },
            { type: 'text' as const, text: '```json\n' + JSON.stringify(client, null, 2) + '\n```' },
          ],
        };
      } catch (err) {
        console.error('[MCP get_client]', err);
        return { content: [{ type: 'text' as const, text: 'Database error — please try again.' }] };
      }
    },
  );
}
