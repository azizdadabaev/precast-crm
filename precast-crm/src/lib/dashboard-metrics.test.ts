import { describe, it, expect } from "vitest";
import {
  accumulateByMonth,
  averageOrderValue,
  countDistinct,
  dayKey,
  monthKey,
  monthWindow,
  outstandingAmount,
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
