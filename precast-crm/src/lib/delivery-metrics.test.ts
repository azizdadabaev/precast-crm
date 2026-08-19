import { describe, it, expect } from "vitest";
import {
  localDayNumber,
  originalPromiseFor,
  isOnTimeAgainst,
  median,
  mean,
  computeDeliveryAdherence,
  computeLeadTime,
  computeOperationsMetrics,
  type DeliveryOrderInput,
} from "./delivery-metrics";

/**
 * Every Date in these tests is built from LOCAL components
 * (`new Date(y, monthIndex, d, h)`) rather than an ISO string, so the
 * assertions hold in any server timezone. That mirrors production, where
 * `scheduledAt` is a DATE stored as local midnight (Asia/Tashkent, +05).
 */
const day = (y: number, m: number, d: number, h = 0, min = 0) =>
  new Date(y, m - 1, d, h, min, 0, 0);

/** A delivered, never-rescheduled order with sane defaults. */
const order = (o: Partial<DeliveryOrderInput> = {}): DeliveryOrderInput => ({
  placedAt: day(2026, 1, 1),
  scheduledAt: day(2026, 1, 10),
  productionStartedAt: day(2026, 1, 8),
  deliveredAt: day(2026, 1, 10, 12),
  rescheduleFroms: [],
  ...o,
});

/** Recursively assert no NaN leaked into a metrics payload. */
function assertNoNaN(value: unknown, path = "root"): void {
  if (typeof value === "number") {
    expect(Number.isNaN(value), `NaN at ${path}`).toBe(false);
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      assertNoNaN(v, `${path}.${k}`);
    }
  }
}

describe("localDayNumber — the calendar-day boundary", () => {
  it("collapses a timestamp to its LOCAL calendar day, ignoring the clock", () => {
    expect(localDayNumber(day(2026, 1, 10, 0, 0))).toBe(20260110);
    expect(localDayNumber(day(2026, 1, 10, 23, 59))).toBe(20260110);
  });

  it("is monotonic across month and year boundaries, so <= is a valid date test", () => {
    expect(localDayNumber(day(2025, 12, 31))).toBeLessThan(localDayNumber(day(2026, 1, 1)));
    expect(localDayNumber(day(2026, 1, 31))).toBeLessThan(localDayNumber(day(2026, 2, 1)));
  });

  it("reads local midnight as its own day — the +05 'stored as previous day 19:00Z' case", () => {
    // scheduledAt is written as local midnight. Whatever UTC instant that is,
    // its LOCAL calendar day must be the day the customer was promised.
    expect(localDayNumber(day(2026, 3, 15, 0, 0))).toBe(20260315);
  });
});

describe("isOnTimeAgainst — boundary behavior", () => {
  it("delivered exactly ON the promised day is ON TIME (the classic off-by-one)", () => {
    expect(isOnTimeAgainst(day(2026, 1, 10, 9), day(2026, 1, 10))).toBe(true);
  });

  it("delivered at 23:00 local on the promised day is still ON TIME (timestamp vs date)", () => {
    expect(isOnTimeAgainst(day(2026, 1, 10, 23, 0), day(2026, 1, 10))).toBe(true);
  });

  it("delivered just after midnight the next day is LATE", () => {
    expect(isOnTimeAgainst(day(2026, 1, 11, 0, 30), day(2026, 1, 10))).toBe(false);
  });

  it("delivered early is on time", () => {
    expect(isOnTimeAgainst(day(2026, 1, 8, 17), day(2026, 1, 10))).toBe(true);
  });
});

describe("originalPromiseFor — recovering the baseline SCOR measures against", () => {
  it("an order never rescheduled: original == latest == scheduledAt", () => {
    const o = order({ scheduledAt: day(2026, 1, 10), rescheduleFroms: [] });
    expect(originalPromiseFor(o).getTime()).toBe(o.scheduledAt.getTime());
  });

  it("multiple reschedules: the EARLIEST 'from' is the original promise", () => {
    const o = order({
      scheduledAt: day(2026, 2, 20),
      rescheduleFroms: [day(2026, 1, 10), day(2026, 1, 25), day(2026, 2, 5)],
    });
    expect(originalPromiseFor(o).getTime()).toBe(day(2026, 1, 10).getTime());
  });

  it("takes the earliest by VALUE, not array position", () => {
    const o = order({ rescheduleFroms: [day(2026, 2, 5), day(2026, 1, 10)] });
    expect(originalPromiseFor(o).getTime()).toBe(day(2026, 1, 10).getTime());
  });
});

describe("computeDeliveryAdherence — the honest vs flattering gap", () => {
  it("an order pushed later then delivered on the NEW date: on-time vs latest TRUE, vs original FALSE", () => {
    const pushed = order({
      scheduledAt: day(2026, 1, 20),
      deliveredAt: day(2026, 1, 20, 14),
      rescheduleFroms: [day(2026, 1, 10)],
    });

    expect(isOnTimeAgainst(pushed.deliveredAt!, pushed.scheduledAt)).toBe(true);
    expect(isOnTimeAgainst(pushed.deliveredAt!, originalPromiseFor(pushed))).toBe(false);

    const a = computeDeliveryAdherence([pushed]);
    expect(a.onTimeVsLatestPromise).toEqual({ onTime: 1, total: 1, ratePct: 100 });
    expect(a.onTimeVsOriginalPromise).toEqual({ onTime: 0, total: 1, ratePct: 0 });
    // The gap IS the deliverable: 100 points of adherence bought by moving the date.
    expect(a.adherenceGapPct).toBe(100);
  });

  it("with no reschedules anywhere the two measures agree and the gap is zero", () => {
    const a = computeDeliveryAdherence([order(), order()]);
    expect(a.onTimeVsLatestPromise.ratePct).toBe(100);
    expect(a.onTimeVsOriginalPromise.ratePct).toBe(100);
    expect(a.adherenceGapPct).toBe(0);
  });

  it("excludes orders with no deliveredAt and reports how many were set aside", () => {
    const a = computeDeliveryAdherence([
      order(),
      order({ deliveredAt: null }),
      order({ deliveredAt: null }),
    ]);
    expect(a.deliveredOrders).toBe(1);
    expect(a.excludedNoDeliveryDate).toBe(2);
    expect(a.onTimeVsLatestPromise.total).toBe(1);
  });

  it("reports reschedule rate and the average number of moves per rescheduled order", () => {
    const a = computeDeliveryAdherence([
      order({ rescheduleFroms: [day(2026, 1, 5)] }),
      order({ rescheduleFroms: [day(2026, 1, 5), day(2026, 1, 7), day(2026, 1, 9)] }),
      order(),
      order(),
    ]);
    expect(a.reschedule.rescheduledOrders).toBe(2);
    expect(a.reschedule.ratePct).toBe(50);
    expect(a.reschedule.totalMoves).toBe(4);
    expect(a.reschedule.avgMovesPerRescheduledOrder).toBe(2);
  });

  it("empty input yields no NaN and no divide-by-zero", () => {
    const a = computeDeliveryAdherence([]);
    expect(a.deliveredOrders).toBe(0);
    expect(a.onTimeVsLatestPromise.ratePct).toBeNull();
    expect(a.onTimeVsOriginalPromise.ratePct).toBeNull();
    expect(a.adherenceGapPct).toBeNull();
    expect(a.reschedule.ratePct).toBeNull();
    expect(a.reschedule.avgMovesPerRescheduledOrder).toBeNull();
    assertNoNaN(a);
  });
});

describe("median / mean", () => {
  it("returns null on empty input rather than NaN", () => {
    expect(median([])).toBeNull();
    expect(mean([])).toBeNull();
  });

  it("median averages the two middle values on an even count", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("median does not mutate the caller's array", () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });

  it("a single large outlier moves the mean but not the median", () => {
    const xs = [1, 1, 1, 1, 100];
    expect(median(xs)).toBe(1);
    expect(mean(xs)).toBe(20.8);
  });
});

describe("computeLeadTime — dwell vs process, never netted together", () => {
  it("splits dwell (customer waiting) from process (our working time)", () => {
    // placed Jan 1, production starts Jan 8 (7 days dwell), delivered Jan 10 (2 days process)
    const lt = computeLeadTime([
      order({
        placedAt: day(2026, 1, 1),
        productionStartedAt: day(2026, 1, 8),
        deliveredAt: day(2026, 1, 10),
      }),
    ]);
    expect(lt.dwellDays.median).toBe(7);
    expect(lt.processDays.median).toBe(2);
    expect(lt.totalCycleDays.median).toBe(9);
    // Dwell + process must reconstruct the total — process is never netted down.
    expect(lt.dwellDays.median! + lt.processDays.median!).toBe(lt.totalCycleDays.median);
  });

  it("measures fractional days from real timestamps, so a same-day build is not rounded up to 1", () => {
    const lt = computeLeadTime([
      order({
        productionStartedAt: day(2026, 1, 10, 6),
        deliveredAt: day(2026, 1, 10, 18),
      }),
    ]);
    expect(lt.processDays.median).toBe(0.5);
  });

  it("null productionStartedAt: excluded from the split, counted in the unsplittable tally, still in total cycle", () => {
    const lt = computeLeadTime([
      order({ productionStartedAt: day(2026, 1, 8), deliveredAt: day(2026, 1, 10) }),
      order({
        placedAt: day(2026, 1, 1),
        productionStartedAt: null,
        deliveredAt: day(2026, 1, 6),
      }),
    ]);
    expect(lt.deliveredOrders).toBe(2);
    expect(lt.unsplittableOrders).toBe(1);
    expect(lt.dwellDays.count).toBe(1);
    expect(lt.processDays.count).toBe(1);
    // The unsplittable order still has a knowable end-to-end cycle.
    expect(lt.totalCycleDays.count).toBe(2);
  });

  it("reports BOTH median and mean, so one outlier cannot hide behind an average", () => {
    const build = (days: number) =>
      order({
        placedAt: day(2026, 1, 1),
        productionStartedAt: day(2026, 1, 1),
        deliveredAt: day(2026, 1, 1 + days),
      });
    const lt = computeLeadTime([build(1), build(1), build(1), build(1), build(100)]);
    expect(lt.processDays.median).toBe(1);
    expect(lt.processDays.mean).toBe(20.8);
    expect(lt.processDays.count).toBe(5);
  });

  it("excludes undelivered orders and counts them", () => {
    const lt = computeLeadTime([order(), order({ deliveredAt: null })]);
    expect(lt.deliveredOrders).toBe(1);
    expect(lt.excludedNoDeliveryDate).toBe(1);
  });

  it("empty input yields nulls, not NaN", () => {
    const lt = computeLeadTime([]);
    expect(lt.deliveredOrders).toBe(0);
    expect(lt.unsplittableOrders).toBe(0);
    for (const stat of [lt.dwellDays, lt.processDays, lt.totalCycleDays]) {
      expect(stat.median).toBeNull();
      expect(stat.mean).toBeNull();
      expect(stat.count).toBe(0);
    }
    assertNoNaN(lt);
  });
});

describe("computeOperationsMetrics", () => {
  it("returns both metric groups from a single pass over the same orders", () => {
    const m = computeOperationsMetrics([order(), order({ deliveredAt: null })]);
    expect(m.deliveryAdherence.deliveredOrders).toBe(1);
    expect(m.leadTime.deliveredOrders).toBe(1);
    expect(m.deliveryAdherence.excludedNoDeliveryDate).toBe(1);
  });

  it("survives an empty window without throwing", () => {
    expect(() => computeOperationsMetrics([])).not.toThrow();
  });
});
