export const dynamic = 'force-dynamic';

import { ok, fail } from '@/lib/api';
import { withPermission } from '@/lib/api-auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isMonthKey, monthBounds } from '@/lib/month-orders';
import { attributionDate } from '@/lib/payment-attribution';
import {
  buildRemainderContext,
  LEDGER_REASONS,
  ledgerTotals,
  monthOf,
  sortLedger,
  type LedgerRow,
} from '@/lib/ledger';
import { FULFILMENT_SELECT, fulfilmentOf } from '@/lib/fulfilment-data';

// Same live-order set as every dashboard figure.
const LIVE: Prisma.OrderWhereInput = { status: { notIn: ['CANCELED', 'DRAFT'] } };

/**
 * GET /api/ledger?month=YYYY-MM
 *
 * Every money and volume figure attributed to `month`, with the date and the
 * reason it landed there. Built from the SAME rules the dashboard totals use —
 * `payment-attribution` for cash and `loaded-volume` for product — so the
 * ledger explains the dashboard rather than offering a second opinion.
 */
// Owner-only. The ledger exposes every payment and every order's volume in
// one place, which is a wider view than any operator needs.
export const GET = withPermission(
  'ledger.view',
  async (req) => {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get('month');
    if (!isMonthKey(month)) {
      return fail('Нотўғри ой · invalid month key (expected YYYY-MM)', 400);
    }
    const { start, end } = monthBounds(month);
    const inMonth = (d: Date | null | undefined) => !!d && d >= start && d <= end;

    const rows: LedgerRow[] = [];

    // ── MONEY ────────────────────────────────────────────────────────
    // Fetched by both candidate dates, then filtered on the ATTRIBUTION
    // date, so a payment backdated into this month is caught even though
    // it was confirmed in another.
    const payments = await prisma.payment.findMany({
      where: {
        status: 'CONFIRMED',
        order: LIVE,
        OR: [
          { paidOn: { gte: start, lte: end } },
          { paidOn: null, confirmedAt: { gte: start, lte: end } },
        ],
      },
      select: {
        id: true, amount: true, paidOn: true, confirmedAt: true, recordedAt: true,
        order: {
          select: { id: true, orderNumber: true, placedAt: true, client: { select: { name: true } } },
        },
      },
    });

    for (const p of payments) {
      const at = attributionDate(p);
      if (!at) continue;
      const orderMonth = monthOf(p.order.placedAt);
      const attributedMonth = monthOf(at);
      rows.push({
        id: `pay:${p.id}`,
        kind: 'money',
        orderId: p.order.id,
        orderNumber: p.order.orderNumber,
        clientName: p.order.client.name,
        orderMonth,
        attributedMonth,
        attributedAt: at.toISOString(),
        reason: p.paidOn ? LEDGER_REASONS.paidOn : LEDGER_REASONS.confirmedAt,
        amount: Math.round(Number(p.amount)),
        crossesMonth: orderMonth !== attributedMonth,
      });
    }

    // ── VOLUME ───────────────────────────────────────────────────────
    // Candidates are orders that could contribute to this month by either
    // route: a truck loaded in it, or a delivery in it carrying a remainder.
    const orders = await prisma.order.findMany({
      where: {
        ...LIVE,
        OR: [
          { loadedAt: { gte: start, lte: end } },
          { deliveredAt: { gte: start, lte: end } },
          { shipments: { some: { loadedAt: { gte: start, lte: end } } } },
          // A truck DELIVERED this month completes its order even if it
          // loaded earlier, so the remainder is reachable by that date too.
          { shipments: { some: { deliveredAt: { gte: start, lte: end } } } },
        ],
      },
      select: {
        ...FULFILMENT_SELECT,
        orderNumber: true,
        placedAt: true,
        client: { select: { name: true } },
      },
    });

    // Rows come from the fulfilment engine — the same one behind the
    // dashboard total — so a truck's m² here is the m² it carried by its
    // beams (owner rule 2026-10-06).
    for (const o of orders) {
      const orderMonth = monthOf(o.placedAt);
      const f = fulfilmentOf(o);
      // What the trucks already recorded, and in which months — so a
      // remainder row can say "the rest was counted in July".
      const recorded = { blocks: 0, beamCount: 0, beamMeters: 0, area: 0 };
      const recordedMonths: string[] = [];
      for (const e of f.events) {
        if (e.source === 'remainder') continue;
        recorded.blocks += e.blocks;
        recorded.beamCount += e.beamCount;
        recorded.beamMeters += e.beamMeters;
        recorded.area += e.area;
        recordedMonths.push(monthOf(e.at));
      }
      for (const e of f.events) {
        // Only rows landing IN this month belong in the list.
        if (!inMonth(e.at)) continue;
        const attributedMonth = monthOf(e.at);
        const reason =
          e.source === 'shipment'
            ? LEDGER_REASONS.shipmentLoaded(e.shipmentNumber ?? 0)
            : e.source === 'single'
              ? LEDGER_REASONS.singleTruck
              : LEDGER_REASONS.deliveredRemainder;
        rows.push({
          id: `vol:${o.id}:${e.source === 'shipment' ? `ship${e.shipmentNumber}` : e.source}`,
          kind: 'volume',
          orderId: o.id,
          orderNumber: o.orderNumber,
          clientName: o.client.name,
          orderMonth,
          attributedMonth,
          attributedAt: e.at.toISOString(),
          reason,
          blocks: e.blocks,
          beamCount: e.beamCount,
          beamMeters: Math.round(e.beamMeters * 10) / 10,
          area: Math.round(e.area * 10) / 10,
          crossesMonth: orderMonth !== attributedMonth,
          ...(e.source === 'remainder'
            ? { context: buildRemainderContext(f.totals, recorded, recordedMonths) }
            : {}),
        });
      }
    }

    const sorted = sortLedger(rows);
    return ok({ month, rows: sorted, totals: ledgerTotals(sorted) });
  },
);
