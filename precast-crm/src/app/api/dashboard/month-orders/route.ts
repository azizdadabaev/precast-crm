export const dynamic = 'force-dynamic';

import { ok, fail } from '@/lib/api';
import { withPermissionAny } from '@/lib/api-auth';
import { prisma } from '@/lib/prisma';
import { isMonthKey, monthBounds } from '@/lib/month-orders';

/**
 * Every order in one calendar month, for the modal behind «Барчаси →».
 *
 * Deliberately NOT `/api/orders`: that route filters by a single delivery day,
 * sorts by `scheduledAt`, and includes cancelled orders, so its totals would
 * contradict the dashboard card sitting directly above this list.
 *
 * `basis` mirrors the dashboard's date toggle so the modal reconciles with the
 * Booked card — 'order' groups by `placedAt`, 'delivery' by `scheduledAt`.
 * The SORT is always `placedAt` desc regardless: the owner asked for the list
 * ordered by when each order was taken.
 */
export const GET = withPermissionAny(
  ['dashboard.viewBasic', 'dashboard.view'],
  async (req) => {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month');
    const basis = searchParams.get('basis') === 'delivery' ? 'delivery' : 'order';

    // Validated, not coerced: a malformed key would otherwise become an
    // Invalid Date and silently match every row in the table.
    if (!isMonthKey(month)) {
      return fail('Нотўғри ой · invalid month key (expected YYYY-MM)', 400);
    }

    const { start, end } = monthBounds(month);
    const dateField = basis === 'delivery' ? 'scheduledAt' : 'placedAt';

    const rows = await prisma.order.findMany({
      // Same exclusion as every other dashboard figure: CANCELED is money that
      // never happened, DRAFT is reserved. Keep in step with LIVE_ORDERS.
      where: {
        status: { notIn: ['CANCELED', 'DRAFT'] },
        [dateField]: { gte: start, lte: end },
      },
      orderBy: { placedAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        totalArea: true,
        totalPrice: true,
        totalBeams: true,
        totalBlocks: true,
        paymentState: true,
        placedAt: true,
        client: { select: { name: true } },
      },
    });

    const orders = rows.map((r) => ({
      id: r.id,
      orderNumber: r.orderNumber,
      clientName: r.client.name,
      primaryProductLabel:
        r.totalBeams > 0
          ? `${r.totalBeams} та балка · ${r.totalBlocks} та блок`
          : 'Преcaст',
      totalArea: Math.round(Number(r.totalArea) * 10) / 10,
      totalPrice: Math.round(Number(r.totalPrice)),
      paymentState: r.paymentState as 'FULLY_PAID' | 'PARTIALLY_PAID' | 'AWAITING_PAYMENT',
    }));

    return ok({
      month,
      basis,
      orders,
      orderCount: orders.length,
      // Summed from the same rows the list shows, so the header can never
      // disagree with the lines beneath it.
      totalSum: orders.reduce((s, o) => s + o.totalPrice, 0),
    });
  },
);
