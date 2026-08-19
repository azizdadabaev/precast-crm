/**
 * Operations metrics — delivery adherence and lead time.
 *
 * PURE functions only. No Prisma, no I/O, no `new Date()` without an argument.
 * The route does the querying and hands these plain arrays, which is what makes
 * the date arithmetic testable.
 *
 * Two research-backed decisions drive this file, both of which cost us a
 * flattering number:
 *
 *  1. SCOR RL.2.2 measures delivery performance against the ORIGINAL commit
 *     date, not the most recently renegotiated one. `Order.scheduledAt` is
 *     overwritten on every reschedule, so we recover the original from the
 *     `SCHEDULED_DATE_CHANGED` events and report BOTH numbers side by side.
 *     The gap between them is the point of the metric, not a defect in it.
 *
 *  2. Cycle Time = Process Time + Dwell Time, and you benchmark on Process
 *     Time. Customers here order weeks ahead against a delivery date they
 *     chose, so raw placement->delivery is mostly customer-imposed dwell and
 *     says nothing about our responsiveness. Dwell is reported separately and
 *     is never netted out of process time.
 */

export type DeliveryOrderInput = {
  placedAt: Date;
  /** The LATEST promise. Overwritten in place on every reschedule. */
  scheduledAt: Date;
  productionStartedAt: Date | null;
  deliveredAt: Date | null;
  /**
   * The `payload.from` value of every `SCHEDULED_DATE_CHANGED` event on this
   * order — i.e. each date this order was moved AWAY from. Empty when the
   * order was never rescheduled.
   */
  rescheduleFroms: Date[];
};

export type OnTimeStat = {
  onTime: number;
  total: number;
  /** Percent 0-100, one decimal. `null` when there is nothing to divide by. */
  ratePct: number | null;
};

export type RescheduleStat = {
  rescheduledOrders: number;
  ratePct: number | null;
  totalMoves: number;
  avgMovesPerRescheduledOrder: number | null;
};

export type DeliveryAdherence = {
  deliveredOrders: number;
  /** Non-cancelled orders in the window with no `deliveredAt`. Stated, not hidden. */
  excludedNoDeliveryDate: number;
  /** The flattering measure: judged against the date as it stands today. */
  onTimeVsLatestPromise: OnTimeStat;
  /** The honest measure: judged against the earliest date we ever promised. */
  onTimeVsOriginalPromise: OnTimeStat;
  /**
   * `onTimeVsLatestPromise - onTimeVsOriginalPromise`, in percentage points.
   * How much adherence was bought by moving dates rather than by delivering.
   */
  adherenceGapPct: number | null;
  reschedule: RescheduleStat;
};

export type DurationStat = {
  /** Days, two decimals. Median leads because one outlier distorts the mean. */
  median: number | null;
  mean: number | null;
  /** How many orders actually contributed to this statistic. */
  count: number;
};

export type LeadTime = {
  deliveredOrders: number;
  excludedNoDeliveryDate: number;
  /**
   * Delivered orders with a null `productionStartedAt`. Their cycle time is
   * knowable but cannot be split into dwell and process, so they are counted
   * here rather than silently dropped.
   */
  unsplittableOrders: number;
  /** `productionStartedAt - placedAt` — the order waiting for its slot. */
  dwellDays: DurationStat;
  /** `deliveredAt - productionStartedAt` — our actual working time. Headline. */
  processDays: DurationStat;
  /** `deliveredAt - placedAt` — end to end, dwell included. */
  totalCycleDays: DurationStat;
};

export type OperationsMetrics = {
  deliveryAdherence: DeliveryAdherence;
  leadTime: LeadTime;
};

const MS_PER_DAY = 86_400_000;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Collapse a timestamp to a comparable LOCAL calendar-day key, `YYYYMMDD`.
 *
 * The server runs with `TZ=Asia/Tashkent` (+05, no DST), and `scheduledAt` is
 * semantically a DATE stored as the local midnight — which is the PREVIOUS day
 * at 19:00Z. Reading it in UTC (or bucketing with `date_trunc`) therefore
 * shifts every promised date back by one day and quietly makes on-time
 * deliveries look late. Using getFullYear/getMonth/getDate reads the local
 * calendar day directly, matching how the rest of the codebase buckets dates
 * (see src/lib/dashboard-data.ts and src/app/api/orders/capacity/route.ts).
 *
 * The `YYYYMMDD` integer form is monotonic across month and year boundaries,
 * so `<=` on two keys is a valid "on or before this date" test.
 */
export function localDayNumber(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/**
 * On time when delivery happened on or before the promised CALENDAR DAY.
 *
 * `deliveredAt` is a real timestamp and `promise` is a date-at-midnight, so a
 * raw `deliveredAt <= promise` comparison would mark everything delivered after
 * 00:00 on the promised day as late. Both sides are collapsed to a local day
 * first, which is also the acceptable on-time window we are defining in
 * advance: same-day, zero days of grace on either side.
 */
export function isOnTimeAgainst(deliveredAt: Date, promise: Date): boolean {
  return localDayNumber(deliveredAt) <= localDayNumber(promise);
}

/**
 * The original commit date this order should be judged against.
 *
 * Every `SCHEDULED_DATE_CHANGED` event records the date the order was moved
 * away from, so the earliest such value is the earliest date we ever promised.
 * With no events, the order was never moved and the current `scheduledAt` IS
 * the original promise.
 *
 * Note on `earliest by value` vs `first by event time`: for the normal pattern
 * (dates only ever slip later) these are the same value. They diverge only if a
 * date was pulled EARLIER and then pushed later, where taking the minimum holds
 * us to the tightest date we ever quoted. That is deliberately the conservative
 * choice — this metric should never flatter.
 *
 * Caveat, and the reason both measures are reported rather than just this one:
 * nothing in the schema records WHO initiated a change. SCOR lets a
 * customer-requested, supplier-agreed date change form a new baseline, but our
 * own slip does not. Until an initiator is recorded we cannot separate the two,
 * so this treats EVERY change as our slip — the strict reading. The truth for
 * any given order sits between this number and `onTimeVsLatestPromise`.
 */
export function originalPromiseFor(order: DeliveryOrderInput): Date {
  let earliest = order.scheduledAt;
  for (const from of order.rescheduleFroms) {
    if (from.getTime() < earliest.getTime()) earliest = from;
  }
  return earliest;
}

/** Median of a sample. `null` on empty input — never NaN. Does not mutate. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const m =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return round2(m);
}

/** Arithmetic mean. `null` on empty input — never NaN. */
export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return round2(sum / values.length);
}

function toDurationStat(values: number[]): DurationStat {
  return { median: median(values), mean: mean(values), count: values.length };
}

function toOnTimeStat(onTime: number, total: number): OnTimeStat {
  return { onTime, total, ratePct: total === 0 ? null : round1((onTime / total) * 100) };
}

/**
 * Elapsed days between two real timestamps, as a fraction.
 *
 * Asia/Tashkent has no DST, so wall-clock elapsed time is exact. Fractions are
 * kept deliberately: an order that starts production at 06:00 and ships at
 * 18:00 took half a day, and rounding that up to 1 would overstate process
 * time on every same-day build.
 */
function elapsedDays(from: Date, to: Date): number {
  return round2((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/**
 * Delivery adherence, measured both ways.
 *
 * Callers must have already excluded CANCELED orders (SCOR excludes
 * customer-cancelled orders from delivery performance). Orders with no
 * `deliveredAt` cannot have their delivery judged, so they are excluded from
 * the rates and counted in `excludedNoDeliveryDate`.
 */
export function computeDeliveryAdherence(orders: DeliveryOrderInput[]): DeliveryAdherence {
  const delivered: DeliveryOrderInput[] = [];
  let excludedNoDeliveryDate = 0;

  for (const o of orders) {
    if (o.deliveredAt === null) excludedNoDeliveryDate += 1;
    else delivered.push(o);
  }

  let onTimeLatest = 0;
  let onTimeOriginal = 0;
  let rescheduledOrders = 0;
  let totalMoves = 0;

  for (const o of delivered) {
    // Non-null by construction of `delivered`.
    const deliveredAt = o.deliveredAt as Date;
    if (isOnTimeAgainst(deliveredAt, o.scheduledAt)) onTimeLatest += 1;
    if (isOnTimeAgainst(deliveredAt, originalPromiseFor(o))) onTimeOriginal += 1;
    if (o.rescheduleFroms.length > 0) {
      rescheduledOrders += 1;
      totalMoves += o.rescheduleFroms.length;
    }
  }

  const total = delivered.length;
  const latest = toOnTimeStat(onTimeLatest, total);
  const original = toOnTimeStat(onTimeOriginal, total);

  return {
    deliveredOrders: total,
    excludedNoDeliveryDate,
    onTimeVsLatestPromise: latest,
    onTimeVsOriginalPromise: original,
    adherenceGapPct:
      latest.ratePct === null || original.ratePct === null
        ? null
        : round1(latest.ratePct - original.ratePct),
    reschedule: {
      rescheduledOrders,
      ratePct: total === 0 ? null : round1((rescheduledOrders / total) * 100),
      totalMoves,
      avgMovesPerRescheduledOrder:
        rescheduledOrders === 0 ? null : round2(totalMoves / rescheduledOrders),
    },
  };
}

/**
 * Lead time split into dwell (customer-imposed waiting) and process (our
 * working time). Process time is the headline; dwell is reported beside it and
 * is never subtracted from it.
 *
 * Callers must have already excluded CANCELED orders.
 */
export function computeLeadTime(orders: DeliveryOrderInput[]): LeadTime {
  const dwell: number[] = [];
  const process: number[] = [];
  const cycle: number[] = [];
  let deliveredOrders = 0;
  let excludedNoDeliveryDate = 0;
  let unsplittableOrders = 0;

  for (const o of orders) {
    if (o.deliveredAt === null) {
      excludedNoDeliveryDate += 1;
      continue;
    }
    deliveredOrders += 1;
    cycle.push(elapsedDays(o.placedAt, o.deliveredAt));

    if (o.productionStartedAt === null) {
      // End-to-end cycle is still knowable; only the split is not.
      unsplittableOrders += 1;
      continue;
    }
    dwell.push(elapsedDays(o.placedAt, o.productionStartedAt));
    process.push(elapsedDays(o.productionStartedAt, o.deliveredAt));
  }

  return {
    deliveredOrders,
    excludedNoDeliveryDate,
    unsplittableOrders,
    dwellDays: toDurationStat(dwell),
    processDays: toDurationStat(process),
    totalCycleDays: toDurationStat(cycle),
  };
}

/** Both metric groups from one pass of orders. */
export function computeOperationsMetrics(orders: DeliveryOrderInput[]): OperationsMetrics {
  return {
    deliveryAdherence: computeDeliveryAdherence(orders),
    leadTime: computeLeadTime(orders),
  };
}
