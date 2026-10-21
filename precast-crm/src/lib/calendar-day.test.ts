import { describe, it, expect } from 'vitest';
import { calendarDay, calendarBuckets } from './calendar-day';

// Local-time dates, like the calendar (server local day).
const order = (id: string, scheduledAt: Date, totalArea: number | string, totalBlocks: number, totalBeams: number) =>
  ({ id, scheduledAt, totalArea, totalBlocks, totalBeams });

describe('calendarDay — owner rule 2026-10-21: an order lives on its scheduled day only', () => {
  it('#10-0047: scheduled 20 Oct, loaded and delivered 21 Oct → 20 Oct', () => {
    expect(calendarDay({ scheduledAt: new Date(2026, 9, 20) })).toBe('2026-10-20');
  });
  it('#10-0039: loaded the evening before → still its scheduled day', () => {
    expect(calendarDay({ scheduledAt: new Date(2026, 9, 14) })).toBe('2026-10-14');
  });
});

describe('calendarBuckets', () => {
  it('counts each order once, as the whole order, on its scheduled day', () => {
    const m = calendarBuckets([
      order('0047', new Date(2026, 9, 20), '81.512', 661, 35),
      order('0038', new Date(2026, 9, 17), 162.226, 1249, 76),
      order('x', new Date(2026, 9, 20, 15, 30), 10, 100, 5),
    ]);
    expect([...m.keys()].sort()).toEqual(['2026-10-17', '2026-10-20']);
    const oct20 = m.get('2026-10-20')!;
    expect(oct20.orderIds).toEqual(new Set(['0047', 'x']));
    expect(oct20.area).toBeCloseTo(91.512, 3);
    expect(oct20.blocks).toBe(761);
    expect(oct20.beamCount).toBe(40);
    expect(m.get('2026-10-17')!.blocks).toBe(1249);
  });
  it('accepts Prisma decimals for the area', () => {
    const m = calendarBuckets([order('a', new Date(2026, 9, 1), { toString: () => '12.5' } as unknown as string, 1, 1)]);
    expect(m.get('2026-10-01')!.area).toBe(12.5);
  });
});
