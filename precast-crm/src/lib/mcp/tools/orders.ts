import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

const ORDER_STATUS_VALUES = ['DRAFT', 'PLACED', 'IN_PRODUCTION', 'LOADED', 'DISPATCHED', 'DELIVERED', 'CANCELED'] as const;

export async function listOrders(params: {
  status?: string;
  page?: number;
  pageSize?: number;
  clientName?: string;
  day?: string;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, params.pageSize ?? 20));

  const where: Record<string, unknown> = {};
  if (params.status) where.status = params.status;
  if (params.clientName) {
    where.client = { name: { contains: params.clientName, mode: 'insensitive' } };
  }
  if (params.day && /^\d{4}-\d{2}-\d{2}$/.test(params.day)) {
    const [y, m, d] = params.day.split('-').map(Number);
    where.scheduledAt = {
      gte: new Date(y, m - 1, d, 0, 0, 0, 0),
      lt: new Date(y, m - 1, d + 1, 0, 0, 0, 0),
    };
  }

  const [total, items] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: [{ scheduledAt: 'asc' }, { placedAt: 'desc' }],
      include: { client: { select: { name: true, phone: true } } },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    items: items.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentState: o.paymentState,
      totalPrice: Number(o.totalPrice),
      totalArea: Number(o.totalArea),
      confirmedPaid: Number(o.confirmedPaid),
      clientName: o.client.name,
      clientPhone: o.client.phone,
      scheduledAt: o.scheduledAt,
      placedAt: o.placedAt,
      deliveredAt: o.deliveredAt,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function getOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      client: true,
      project: { include: { calculations: true } },
      payments: { orderBy: { recordedAt: 'desc' } },
      shipments: { orderBy: { number: 'asc' } },
      events: { orderBy: { id: 'desc' }, take: 50 },
      dispatch: { include: { driver: true } },
    },
  });
}

export function registerOrderTools(server: McpServer): void {
  server.tool(
    'list_orders',
    'List orders with optional filters. Returns paginated results (max 50 per page).',
    {
      status: z.enum(ORDER_STATUS_VALUES).optional().describe('Filter by order status'),
      page: z.number().int().min(1).optional().describe('Page number, 1-based (default: 1)'),
      pageSize: z.number().int().min(1).max(50).optional().describe('Results per page (default: 20, max: 50)'),
      clientName: z.string().optional().describe('Substring search on client name'),
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Filter by scheduled date (YYYY-MM-DD)'),
    },
    async (params) => {
      try {
        const data = await listOrders(params);
        const summary = `Found ${data.total} order(s) (page ${data.page}/${data.totalPages}). Showing ${data.items.length}.`;
        return {
          content: [
            { type: 'text' as const, text: summary },
            { type: 'text' as const, text: '```json\n' + JSON.stringify(data, null, 2) + '\n```' },
          ],
        };
      } catch (err) {
        console.error('[MCP list_orders]', err);
        return { content: [{ type: 'text' as const, text: 'Database error — please try again.' }] };
      }
    },
  );

  server.tool(
    'get_order',
    'Get full detail for a single order — rooms, payments, shipments, event timeline, and client.',
    {
      orderId: z.string().describe('The order ID (uuid)'),
    },
    async ({ orderId }) => {
      try {
        const order = await getOrder(orderId);
        if (!order) {
          return { content: [{ type: 'text' as const, text: `Order ${orderId} not found.` }] };
        }
        const summary = `Order ${order.orderNumber} — ${order.status} — ${order.client.name} — ${Number(order.totalPrice).toLocaleString('ru-RU')} UZS`;
        return {
          content: [
            { type: 'text' as const, text: summary },
            { type: 'text' as const, text: '```json\n' + JSON.stringify(order, null, 2) + '\n```' },
          ],
        };
      } catch (err) {
        console.error('[MCP get_order]', err);
        return { content: [{ type: 'text' as const, text: 'Database error — please try again.' }] };
      }
    },
  );
}
