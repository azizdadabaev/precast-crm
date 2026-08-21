export const dynamic = 'force-dynamic';

import { ok, fail } from '@/lib/api';
import { withPermission } from '@/lib/api-auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isMonthKey, monthBounds } from '@/lib/month-orders';

const PAGE_SIZE = 200;

/**
 * GET /api/ledger/events?month=YYYY-MM[&type=...][&orderId=...][&cursor=...]
 *
 * The raw `OrderEvent` history — every payment, load, dispatch, delivery,
 * edit and status change — newest first. The attribution ledger answers
 * "which month did this land in"; this answers "what actually happened".
 *
 * Cursor-paged rather than offset-paged: an offset would skip or repeat rows
 * as new events arrive mid-scroll.
 */
// Owner-only. The ledger exposes every payment and every order's volume in
// one place, which is a wider view than any operator needs.
export const GET = withPermission(
  'ledger.view',
  async (req) => {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month');
    const type = searchParams.get('type') ?? undefined;
    const orderId = searchParams.get('orderId') ?? undefined;
    const cursor = searchParams.get('cursor') ?? undefined;

    // A month is optional here — an order's full history is worth reading
    // end to end — but if given it must be well formed.
    if (month !== null && !isMonthKey(month)) {
      return fail('Нотўғри ой · invalid month key (expected YYYY-MM)', 400);
    }

    const where: Prisma.OrderEventWhereInput = {};
    if (month) {
      const { start, end } = monthBounds(month);
      where.createdAt = { gte: start, lte: end };
    }
    if (orderId) where.orderId = orderId;
    // Validated against the enum by Prisma itself; an unknown value 400s
    // rather than silently returning everything.
    if (type) where.type = type as Prisma.EnumOrderEventTypeFilter['equals'];

    const events = await prisma.orderEvent.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        type: true,
        message: true,
        payload: true,
        createdAt: true,
        actor: { select: { id: true, name: true } },
        order: {
          select: { id: true, orderNumber: true, placedAt: true, client: { select: { name: true } } },
        },
      },
    });

    const hasMore = events.length > PAGE_SIZE;
    const page = hasMore ? events.slice(0, PAGE_SIZE) : events;

    return ok({
      events: page.map((e) => ({
        id: e.id,
        type: e.type,
        message: e.message,
        payload: e.payload,
        createdAt: e.createdAt.toISOString(),
        actorName: e.actor?.name ?? null,
        orderId: e.order.id,
        orderNumber: e.order.orderNumber,
        clientName: e.order.client.name,
      })),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    });
  },
);
