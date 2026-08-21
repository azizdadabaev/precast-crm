export const dynamic = 'force-dynamic';

import { ok, fail } from '@/lib/api';
import { withPermissionAny } from '@/lib/api-auth';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { isMonthKey, monthBounds } from '@/lib/month-orders';
import { attributionDate } from '@/lib/payment-attribution';
import {
  LEDGER_REASONS,
  ledgerTotals,
  monthOf,
  sortLedger,
  type LedgerRow,
} from '@/lib/ledger';
import { areaShares, beamsFromLoadedJson, remainderAfterRecorded, roomBeamMeters } from '@/lib/loaded-volume';

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
export const GET = withPermissionAny(
  ['dashboard.viewBasic', 'dashboard.view'],
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
        ],
      },
      select: {
        id: true, orderNumber: true, status: true, placedAt: true,
        loadedAt: true, deliveredAt: true, scheduledAt: true,
        totalArea: true, totalBlocks: true, totalBeams: true,
        client: { select: { name: true } },
        project: { select: { calculations: { select: { beamCount: true, beamLength: true } } } },
        shipments: {
          where: { loadedAt: { not: null } },
          orderBy: { number: 'asc' },
          select: { id: true, number: true, loadedAt: true, loadedBeams: true, loadedBlocks: true },
        },
      },
    });

    for (const o of orders) {
      const orderMonth = monthOf(o.placedAt);
      const rooms = o.project.calculations.map((c) => ({
        beamCount: c.beamCount,
        beamLength: Number(c.beamLength),
      }));
      const totals = {
        blocks: o.totalBlocks,
        beamCount: o.totalBeams,
        beamMeters: roomBeamMeters(rooms),
        area: Number(o.totalArea),
      };
      const recorded = { blocks: 0, beamCount: 0, beamMeters: 0, area: 0 };

      const push = (
        idSuffix: string, at: Date, reason: string,
        q: { blocks: number; beamCount: number; beamMeters: number; area: number },
      ) => {
        const attributedMonth = monthOf(at);
        rows.push({
          id: `vol:${o.id}:${idSuffix}`,
          kind: 'volume',
          orderId: o.id,
          orderNumber: o.orderNumber,
          clientName: o.client.name,
          orderMonth,
          attributedMonth,
          attributedAt: at.toISOString(),
          reason,
          blocks: q.blocks,
          beamCount: q.beamCount,
          beamMeters: Math.round(q.beamMeters * 10) / 10,
          area: Math.round(q.area * 10) / 10,
          crossesMonth: orderMonth !== attributedMonth,
        });
      };

      if (o.shipments.length > 0) {
        const per = o.shipments.map((s) => ({
          blocks: Number(s.loadedBlocks ?? 0),
          ...beamsFromLoadedJson(s.loadedBeams),
        }));
        const shares = areaShares(totals.area, per);
        o.shipments.forEach((s, i) => {
          const q = {
            blocks: per[i].blocks,
            beamCount: per[i].count,
            beamMeters: per[i].meters,
            area: shares[i] ?? 0,
          };
          recorded.blocks += q.blocks;
          recorded.beamCount += q.beamCount;
          recorded.beamMeters += q.beamMeters;
          recorded.area += q.area;
          // Only rows landing IN this month belong in the list; the rest were
          // summed purely to compute the remainder correctly.
          if (inMonth(s.loadedAt)) {
            push(`ship${s.number}`, s.loadedAt as Date, LEDGER_REASONS.shipmentLoaded(s.number), q);
          }
        });
      } else if (o.loadedAt) {
        recorded.blocks = totals.blocks;
        recorded.beamCount = totals.beamCount;
        recorded.beamMeters = totals.beamMeters;
        recorded.area = totals.area;
        if (inMonth(o.loadedAt)) {
          push('single', o.loadedAt, LEDGER_REASONS.singleTruck, totals);
        }
      }

      if (o.status === 'DELIVERED') {
        const rest = remainderAfterRecorded(totals, recorded);
        const when = o.deliveredAt ?? o.loadedAt ?? o.scheduledAt;
        const worth = rest.blocks > 0 || rest.beamCount > 0 || rest.beamMeters > 0.0001 || rest.area > 0.0001;
        if (worth && inMonth(when)) {
          push('remainder', when, LEDGER_REASONS.deliveredRemainder, rest);
        }
      }
    }

    const sorted = sortLedger(rows);
    return ok({ month, rows: sorted, totals: ledgerTotals(sorted) });
  },
);
