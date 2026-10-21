// Which day an order belongs to on the Orders calendar (owner rule 2026-10-21).
//
// An order lives on exactly ONE day: its scheduled day, counted as the WHOLE
// order. Loading early or late, a second truck, blocks that did not fit or a
// remainder nobody registered never move it or show it on another day — only
// rescheduling does. Per-truck dates still drive the dashboard and the stock
// write-off (src/lib/fulfilment.ts); the calendar and its day list do not use
// them. Orders #10-0039, #10-0038 and #10-0047 each showed on two days while
// the calendar followed the trucks.

import { dayKey } from '@/lib/dashboard-metrics';

type NumLike = number | string | { toString(): string };

export interface CalendarOrder {
  id: string;
  scheduledAt: Date;
  totalArea: NumLike;
  totalBlocks: number;
  totalBeams: number;
}

/** The local calendar day (`YYYY-MM-DD`) the order is shown on. */
export function calendarDay(o: { scheduledAt: Date }): string {
  return dayKey(o.scheduledAt);
}

/** Per day: the whole orders scheduled there. */
export function calendarBuckets(
  orders: CalendarOrder[],
): Map<string, { area: number; blocks: number; beamCount: number; orderIds: Set<string> }> {
  const m = new Map<string, { area: number; blocks: number; beamCount: number; orderIds: Set<string> }>();
  for (const o of orders) {
    const day = calendarDay(o);
    const b = m.get(day) ?? { area: 0, blocks: 0, beamCount: 0, orderIds: new Set<string>() };
    b.area += Number(o.totalArea.toString());
    b.blocks += o.totalBlocks;
    b.beamCount += o.totalBeams;
    b.orderIds.add(o.id);
    m.set(day, b);
  }
  return m;
}
