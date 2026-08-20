import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  accumulateByMonth,
  averageOrderValue,
  countDistinct,
  currentMonthIndex,
  dayKey,
  deliveryMonthWindow,
  monthKey,
  monthWindow,
  monthWindowSpan,
  outstandingAmount,
  remapMonthIndex,
  DELIVERY_WINDOW_BACK,
  DELIVERY_WINDOW_FORWARD,
  ORDER_WINDOW_MONTHS,
} from "./dashboard-metrics";

/** Local-time Date, so the tests exercise the same calendar the app buckets on. */
const local = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe("monthKey / dayKey — local-calendar bucketing", () => {
  it("keys off the server's LOCAL calendar fields, not UTC", () => {
    // 1 Jan 00:30 local. In Asia/Tashkent that is 31 Dec 19:30 UTC — UTC
    // bucketing would file it under the previous month/day.
    const d = new Date(2026, 0, 1, 0, 30);
    expect(monthKey(d)).toBe("2026-01");
    expect(dayKey(d)).toBe("2026-01-01");
  });

  it("zero-pads month and day", () => {
    expect(monthKey(local(2026, 3, 7))).toBe("2026-03");
    expect(dayKey(local(2026, 3, 7))).toBe("2026-03-07");
  });
});

describe("monthWindow", () => {
  it("returns N contiguous buckets ending with the month containing `now`", () => {
    const w = monthWindow(local(2026, 8, 19), 12);
    expect(w).toHaveLength(12);
    expect(w[0]!.key).toBe("2025-09");
    expect(w[11]!.key).toBe("2026-08");
  });

  it("labels months in Uzbek Cyrillic", () => {
    const w = monthWindow(local(2026, 8, 19), 3);
    expect(w.map((b) => b.label)).toEqual(["Июн", "Июл", "Авг"]);
  });

  it("rolls the year backwards correctly", () => {
    const w = monthWindow(local(2026, 2, 3), 4);
    expect(w.map((b) => b.key)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(w[0]!.year).toBe(2025);
  });
});

describe("accumulateByMonth", () => {
  const rows = [
    { at: local(2026, 7, 1), amount: 1_000_000 },
    { at: local(2026, 7, 31, 23), amount: 500_000 },
    { at: local(2026, 8, 1), amount: 250_000 },
  ];

  it("sums and counts per local month", () => {
    const m = accumulateByMonth(rows, (r) => r.at, (r) => r.amount);
    expect(m.get("2026-07")).toEqual({ total: 1_500_000, count: 2 });
    expect(m.get("2026-08")).toEqual({ total: 250_000, count: 1 });
  });

  it("skips rows with no date — a CONFIRMED payment lacking confirmedAt belongs to no month", () => {
    const withNull = [...rows, { at: null as Date | null, amount: 9_000_000 }];
    const m = accumulateByMonth(withNull, (r) => r.at, (r) => r.amount);
    const summed = Array.from(m.values()).reduce((s, v) => s + v.total, 0);
    expect(summed).toBe(1_750_000);
  });

  it("returns an empty map for an empty row set", () => {
    expect(accumulateByMonth([], () => null, () => 0).size).toBe(0);
  });
});

describe("averageOrderValue — booked per order, NOT collections per order", () => {
  it("divides booked value by the order count", () => {
    // 3 orders worth 5 000 000 booked, of which only 1 000 000 has been
    // collected. AOV must be 1 666 667, not 333 333.
    expect(averageOrderValue(5_000_000, 3)).toBe(1_666_667);
  });

  it("counts fully-unpaid orders in the denominator AND the numerator", () => {
    // Two orders: one paid 2 000 000, one unpaid worth 2 000 000.
    // Booked 4 000 000 / 2 = 2 000 000. The old bug divided the
    // collected 2 000 000 by 2 and reported 1 000 000.
    expect(averageOrderValue(4_000_000, 2)).toBe(2_000_000);
  });

  it("returns 0 instead of NaN/Infinity on an empty order set", () => {
    expect(averageOrderValue(0, 0)).toBe(0);
    expect(averageOrderValue(1_000_000, 0)).toBe(0);
    expect(averageOrderValue(1_000_000, -1)).toBe(0);
  });

  it("rounds to whole UZS", () => {
    expect(averageOrderValue(10, 3)).toBe(3);
    expect(averageOrderValue(1_000_001, 2)).toBe(500_001);
  });
});

describe("outstandingAmount", () => {
  it("is totalPrice minus confirmed cash minus write-offs", () => {
    expect(
      outstandingAmount({ totalPrice: 10_000_000, confirmedPaid: 4_000_000, writeOffAmount: 0 }),
    ).toBe(6_000_000);
  });

  it("treats a write-off as settling the balance without cash arriving", () => {
    // FULLY_PAID with cash short — nothing outstanding, but only
    // 4 000 000 was ever collected. paymentState is not a cash proxy.
    expect(
      outstandingAmount({ totalPrice: 10_000_000, confirmedPaid: 4_000_000, writeOffAmount: 6_000_000 }),
    ).toBe(0);
  });

  it("floors at zero when a customer overpays", () => {
    expect(
      outstandingAmount({ totalPrice: 1_000_000, confirmedPaid: 1_500_000, writeOffAmount: 0 }),
    ).toBe(0);
  });
});

describe("countDistinct — customers, not order rows", () => {
  it("counts each client once no matter how many orders they hold", () => {
    expect(countDistinct(["c1", "c1", "c1", "c2"])).toBe(2);
  });

  it("is 0 for an empty set", () => {
    expect(countDistinct([])).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// The two date bases.
//
// An order carries `placedAt` (when it was WON — immutable) and
// `scheduledAt` (when it is PROMISED — mutable). Bucketing by `placedAt`
// alone hid committed work: an order placed in August and rescheduled into
// September read as August money while September read zero booked.
// ─────────────────────────────────────────────────────────────────────

/** An order as the two series see it: one row, two dates, two buckets. */
const order = (placed: Date, scheduled: Date, price: number) => ({
  placedAt: placed,
  scheduledAt: scheduled,
  totalPrice: price,
});

describe("monthWindowSpan — forward-looking windows", () => {
  it("spans `back` months before through `forward` months after now", () => {
    const w = monthWindowSpan(local(2026, 8, 20), 2, 2);
    expect(w.map((b) => b.key)).toEqual([
      "2026-06", "2026-07", "2026-08", "2026-09", "2026-10",
    ]);
  });

  it("carries back + 1 + forward buckets", () => {
    expect(monthWindowSpan(local(2026, 8, 20), 8, 3)).toHaveLength(12);
    expect(monthWindowSpan(local(2026, 8, 20), 0, 0)).toHaveLength(1);
  });

  it("rolls the year forwards across December", () => {
    const w = monthWindowSpan(local(2026, 11, 4), 1, 2);
    expect(w.map((b) => b.key)).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"]);
    expect(w[3]!.year).toBe(2027);
  });
});

describe("the ORDER-DATE window excludes the future", () => {
  it("ends with the month containing today — nothing is ever placed ahead", () => {
    const now = local(2026, 8, 20);
    const w = monthWindow(now, ORDER_WINDOW_MONTHS);
    expect(w).toHaveLength(12);
    expect(w[w.length - 1]!.key).toBe("2026-08");
    expect(w.map((b) => b.key)).not.toContain("2026-09");
    // The current month is the last index on this basis.
    expect(currentMonthIndex(w, now)).toBe(w.length - 1);
  });
});

describe("the DELIVERY-DATE window extends forward", () => {
  const now = local(2026, 8, 20);
  const w = deliveryMonthWindow(now);

  it("includes the committed future months a trailing window would hide", () => {
    // The production complaint: today is 20 August, September is in the
    // FUTURE, and a backward-looking window made 32,8M of scheduled work
    // invisible.
    expect(w.map((b) => b.key)).toContain("2026-09");
    expect(w.map((b) => b.key)).toContain("2026-10");
    expect(w.map((b) => b.key)).toContain("2026-11");
  });

  it("runs from DELIVERY_WINDOW_BACK months back to DELIVERY_WINDOW_FORWARD ahead", () => {
    expect(w).toHaveLength(DELIVERY_WINDOW_BACK + 1 + DELIVERY_WINDOW_FORWARD);
    expect(w[0]!.key).toBe("2025-12");
    expect(w[w.length - 1]!.key).toBe("2026-11");
  });

  it("puts the current month before the end, NOT at the last index", () => {
    const cur = currentMonthIndex(w, now);
    expect(cur).toBe(DELIVERY_WINDOW_BACK);
    expect(w[cur]!.key).toBe("2026-08");
    expect(cur).toBeLessThan(w.length - 1);
  });

  it("keeps every month label distinct, so the x-axis never repeats a name", () => {
    const labels = w.map((b) => b.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("one order, two bases, two different months", () => {
  // Placed 12 August, rescheduled to 4 September. This single row is what
  // made August read 96 orders / 930M and September read zero.
  const rows = [order(local(2026, 8, 12), local(2026, 9, 4), 32_808_800)];

  it("files the order under August on the order basis", () => {
    const byPlaced = accumulateByMonth(rows, (o) => o.placedAt, (o) => o.totalPrice);
    expect(byPlaced.get("2026-08")).toEqual({ total: 32_808_800, count: 1 });
    expect(byPlaced.get("2026-09")).toBeUndefined();
  });

  it("files the SAME order under September on the delivery basis", () => {
    const byScheduled = accumulateByMonth(rows, (o) => o.scheduledAt, (o) => o.totalPrice);
    expect(byScheduled.get("2026-09")).toEqual({ total: 32_808_800, count: 1 });
    expect(byScheduled.get("2026-08")).toBeUndefined();
  });

  it("shows September as zero booked on the order basis and non-zero on delivery", () => {
    const now = local(2026, 8, 20);
    const byPlaced = accumulateByMonth(rows, (o) => o.placedAt, (o) => o.totalPrice);
    const byScheduled = accumulateByMonth(rows, (o) => o.scheduledAt, (o) => o.totalPrice);

    const orderSeries = monthWindow(now, ORDER_WINDOW_MONTHS).map((b) => ({
      key: b.key,
      booked: byPlaced.get(b.key)?.total ?? 0,
    }));
    const deliverySeries = deliveryMonthWindow(now).map((b) => ({
      key: b.key,
      booked: byScheduled.get(b.key)?.total ?? 0,
    }));

    // September has no bucket at all on the order basis…
    expect(orderSeries.find((m) => m.key === "2026-09")).toBeUndefined();
    // …and carries the committed work on the delivery basis.
    expect(deliverySeries.find((m) => m.key === "2026-09")?.booked).toBe(32_808_800);
  });
});

describe("index alignment between the two series of a basis", () => {
  const now = local(2026, 8, 20);
  const rows = [
    order(local(2026, 7, 3), local(2026, 8, 9), 10_000_000),
    order(local(2026, 8, 12), local(2026, 9, 4), 32_808_800),
    order(local(2026, 8, 28), local(2026, 11, 2), 5_000_000),
  ];

  /** Mirrors how fetchDashboardData builds each basis: one window, mapped. */
  function build(window: ReturnType<typeof monthWindow>, getDate: (o: typeof rows[number]) => Date) {
    const map = accumulateByMonth(rows, getDate, (o) => o.totalPrice);
    return {
      booked: window.map((b) => ({ month: b.label, booked: map.get(b.key)?.total ?? 0 })),
      orders: window.map((b) => ({ month: b.label, count: map.get(b.key)?.count ?? 0 })),
      keys: window.map((b) => b.key),
    };
  }

  it("keeps booked and orders index-aligned on both bases", () => {
    for (const [window, getDate] of [
      [monthWindow(now, ORDER_WINDOW_MONTHS), (o: typeof rows[number]) => o.placedAt],
      [deliveryMonthWindow(now), (o: typeof rows[number]) => o.scheduledAt],
    ] as const) {
      const s = build(window, getDate);
      expect(s.booked).toHaveLength(s.orders.length);
      expect(s.booked).toHaveLength(s.keys.length);
      s.booked.forEach((b, i) => expect(b.month).toBe(s.orders[i]!.month));
    }
  });

  it("reads the same month from every series at one index", () => {
    const window = deliveryMonthWindow(now);
    const s = build(window, (o) => o.scheduledAt);
    const sep = s.keys.indexOf("2026-09");
    expect(s.booked[sep]!.booked).toBe(32_808_800);
    expect(s.orders[sep]!.count).toBe(1);
    const nov = s.keys.indexOf("2026-11");
    expect(s.booked[nov]!.booked).toBe(5_000_000);
    expect(s.orders[nov]!.count).toBe(1);
  });
});

describe("remapMonthIndex — flipping the basis keeps the same calendar month", () => {
  const now = local(2026, 8, 20);
  const orderKeys = monthWindow(now, ORDER_WINDOW_MONTHS).map((b) => b.key);
  const deliveryKeys = deliveryMonthWindow(now).map((b) => b.key);

  it("maps a month to its counterpart in the other window", () => {
    // July sits at a different index in each window; the MONTH must survive
    // the flip, not the index.
    const julOnOrder = orderKeys.indexOf("2026-07");
    const julOnDelivery = deliveryKeys.indexOf("2026-07");
    expect(julOnOrder).not.toBe(julOnDelivery);
    expect(remapMonthIndex(orderKeys, deliveryKeys, julOnOrder)).toBe(julOnDelivery);
    expect(remapMonthIndex(deliveryKeys, orderKeys, julOnDelivery)).toBe(julOnOrder);
  });

  it("clamps a future month back into range when it has no counterpart", () => {
    // November is selectable on the delivery basis but does not exist on the
    // order basis — clamp rather than crash or read past the end.
    const nov = deliveryKeys.indexOf("2026-11");
    const remapped = remapMonthIndex(deliveryKeys, orderKeys, nov);
    expect(remapped).toBe(orderKeys.length - 1);
    expect(orderKeys[remapped]).toBe("2026-08");
  });

  it("clamps an out-of-range or empty input instead of returning undefined", () => {
    expect(remapMonthIndex(orderKeys, deliveryKeys, 999)).toBe(deliveryKeys.length - 1);
    expect(remapMonthIndex(orderKeys, deliveryKeys, -3)).toBe(0);
    expect(remapMonthIndex(orderKeys, [], 4)).toBe(0);
  });
});

describe("scheduledAt is a LOCAL date stored as the previous day 19:00Z", () => {
  // Production runs TZ=Asia/Tashkent (+05). A `scheduledAt` of 1 September
  // is persisted as 2026-08-31T19:00:00Z, so UTC / date_trunc bucketing
  // files every scheduled order one day — and sometimes one MONTH — early.
  const ORIGINAL_TZ = process.env.TZ;
  beforeAll(() => { process.env.TZ = "Asia/Tashkent"; });
  afterAll(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  });

  const stored = new Date("2026-08-31T19:00:00.000Z");

  it("buckets the stored instant under the LOCAL month and day", () => {
    expect(stored.getHours()).toBe(0); // guard: the +05 zone really is active
    expect(monthKey(stored)).toBe("2026-09");
    expect(dayKey(stored)).toBe("2026-09-01");
  });

  it("would land in the WRONG month under UTC bucketing", () => {
    // What `date_trunc('month', "scheduledAt")` would have returned.
    expect(stored.toISOString().slice(0, 7)).toBe("2026-08");
    expect(monthKey(stored)).not.toBe(stored.toISOString().slice(0, 7));
  });

  it("puts a delivery scheduled for 1 September in the September bucket", () => {
    const rows = [{ scheduledAt: stored, totalPrice: 32_808_800 }];
    const byScheduled = accumulateByMonth(rows, (r) => r.scheduledAt, (r) => r.totalPrice);
    expect(byScheduled.get("2026-09")).toEqual({ total: 32_808_800, count: 1 });
    expect(byScheduled.get("2026-08")).toBeUndefined();
  });
});
