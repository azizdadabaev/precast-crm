// Server-side half of the fulfilment engine: which order fields it reads and
// which orders can touch a calendar day. The maths lives in `fulfilment.ts`.

import type { Prisma } from '@prisma/client';
import { orderFulfilment, toFulfilmentInput, type OrderFulfilment } from '@/lib/fulfilment';

/** Every field the fulfilment engine reads. */
export const FULFILMENT_SELECT = {
  id: true,
  status: true,
  loadedAt: true,
  deliveredAt: true,
  scheduledAt: true,
  totalArea: true,
  totalBlocks: true,
  totalBeams: true,
  project: {
    select: {
      calculations: { select: { beamLength: true, beamCount: true, totalBlocks: true, monolithArea: true } },
    },
  },
  shipments: {
    orderBy: { number: 'asc' },
    select: {
      number: true,
      status: true,
      loadedAt: true,
      deliveredAt: true,
      loadedBeams: true,
      loadedBlocks: true,
      loadedArea: true,
    },
  },
} satisfies Prisma.OrderSelect;

export type FulfilmentRow = Prisma.OrderGetPayload<{ select: typeof FULFILMENT_SELECT }>;

export function fulfilmentOf(row: FulfilmentRow): OrderFulfilment {
  return orderFulfilment(toFulfilmentInput(row));
}

/**
 * Orders that can put anything on a calendar day in [start, endExclusive):
 * scheduled there (left to ship), a truck loaded there, or a completion there.
 */
export function dayWindowWhere(start: Date, endExclusive: Date): Prisma.OrderWhereInput {
  const w = { gte: start, lt: endExclusive };
  return {
    OR: [
      { scheduledAt: w },
      { loadedAt: w },
      { deliveredAt: w },
      { shipments: { some: { loadedAt: w } } },
      { shipments: { some: { deliveredAt: w } } },
    ],
  };
}
