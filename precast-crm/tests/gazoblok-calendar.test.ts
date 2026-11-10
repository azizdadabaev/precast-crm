import { describe, it, expect } from "vitest";
import {
  calendarDays,
  dayChipLabel,
  monthBounds,
  monthCells,
  parseMonthParam,
  shiftMonth,
  type CalendarRow,
} from "@/lib/gazoblok-calendar";

const row = (p: Partial<CalendarRow>): CalendarRow => ({
  status: "PLACED",
  scheduledAt: new Date(2026, 10, 11, 9),
  totalBlocks: 100,
  totalPrice: 1_000_000,
  confirmedPaid: 1_000_000,
  overshipAmount: 0,
  ...p,
});

describe("parseMonthParam", () => {
  it("reads YYYY-MM and refuses anything else", () => {
    expect(parseMonthParam("2026-11")).toEqual({ year: 2026, month: 11 });
    expect(parseMonthParam("2026-13")).toBeNull();
    expect(parseMonthParam("2026-00")).toBeNull();
    expect(parseMonthParam("11.2026")).toBeNull();
    expect(parseMonthParam(null)).toBeNull();
  });
});

describe("monthBounds", () => {
  it("runs local midnight of the 1st to local midnight of the next month's 1st", () => {
    expect(monthBounds(2026, 11)).toEqual({ start: new Date(2026, 10, 1), end: new Date(2026, 11, 1) });
    expect(monthBounds(2026, 12)).toEqual({ start: new Date(2026, 11, 1), end: new Date(2027, 0, 1) });
  });
});

describe("shiftMonth", () => {
  it("steps across year ends", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-11", 0)).toBe("2026-11");
  });
});

describe("monthCells", () => {
  it("is Monday-first and draws only the weeks the month needs", () => {
    // November 2026 starts on a Sunday: 6 leading days, 5 weeks would hold 35 < 6 + 30.
    const cells = monthCells(2026, 11);
    expect(cells).toHaveLength(42);
    expect(cells[0]).toEqual({ key: "2026-10-26", day: 26, inMonth: false });
    expect(cells[6]).toEqual({ key: "2026-11-01", day: 1, inMonth: true });
    expect(cells[35]).toEqual({ key: "2026-11-30", day: 30, inMonth: true });
    // February 2027 starts on a Monday and fills exactly 4 weeks.
    const feb = monthCells(2027, 2);
    expect(feb).toHaveLength(28);
    expect(feb[0].key).toBe("2027-02-01");
  });
});

describe("calendarDays", () => {
  it("counts each order whole on its scheduled day, sorted by date", () => {
    const days = calendarDays([
      row({ scheduledAt: new Date(2026, 10, 12, 8), totalBlocks: 300 }),
      row({ scheduledAt: new Date(2026, 10, 11, 23, 30), totalBlocks: 120 }),
      row({ scheduledAt: new Date(2026, 10, 11, 0, 0), totalBlocks: 80 }),
    ]);
    expect(days).toEqual([
      { date: "2026-11-11", orders: 2, blocks: 200, flags: { debt: false, unpaid: false } },
      { date: "2026-11-12", orders: 1, blocks: 300, flags: { debt: false, unpaid: false } },
    ]);
  });

  it("leaves out cancelled and unscheduled orders", () => {
    expect(calendarDays([row({ status: "CANCELED" }), row({ scheduledAt: null })])).toEqual([]);
  });

  it("marks a day with money still owed, and a day with unpaid over-load", () => {
    const [d] = calendarDays([row({ confirmedPaid: 400_000 })]);
    expect(d.flags).toEqual({ debt: false, unpaid: true });
    // Over-load: 200 000 surcharge on top of a fully paid 1 000 000 base.
    const [o] = calendarDays([row({ totalPrice: 1_200_000, confirmedPaid: 1_000_000, overshipAmount: 200_000 })]);
    expect(o.flags).toEqual({ debt: true, unpaid: true });
  });

  it("does not call a tiyin rounding difference unpaid", () => {
    const [d] = calendarDays([row({ totalPrice: 0.3, confirmedPaid: 0.1 + 0.2 })]);
    expect(d.flags.unpaid).toBe(false);
  });
});

describe("dayChipLabel", () => {
  it("shows dd.mm", () => {
    expect(dayChipLabel("2026-11-01")).toBe("01.11");
  });
});
