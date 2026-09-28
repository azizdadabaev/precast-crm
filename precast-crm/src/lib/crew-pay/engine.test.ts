import { describe, it, expect } from "vitest";
import {
  xround, addDays, weekStartOf, valueOn, settingOn, dayCalc, computeWeeks,
  type EngineInput,
} from "./engine";

const base = (over: Partial<EngineInput> = {}): EngineInput => ({
  workers: [
    { id: "a", code: "W01", name: "A", status: "ACTIVE", joinedOn: "2026-08-31", leftOn: null },
    { id: "b", code: "W02", name: "B", status: "ACTIVE", joinedOn: "2026-08-31", leftOn: null },
  ],
  days: [],
  ledger: [],
  rates: [{ effectiveFrom: "2026-08-31", ratePerBlock: 500 }],
  settings: [
    { key: "BREAK_ALLOWANCE", value: 0, effectiveFrom: "2026-08-31" },
    { key: "DEBT_CAP", value: 1, effectiveFrom: "2026-08-31" },
    { key: "REJECT_ALARM", value: 0.08, effectiveFrom: "2026-08-31" },
  ],
  ...over,
});

describe("xround (Excel ROUND, half away from zero)", () => {
  it("rounds halves away from zero, including negatives", () => {
    expect(xround(2.5)).toBe(3);
    expect(xround(-2.5)).toBe(-3);
    expect(xround(-0.5)).toBe(-1);
    expect(xround(1113124.5)).toBe(1113125);
    expect(xround(-352125.4)).toBe(-352125);
    expect(xround(0)).toBe(0);
  });
});

describe("dates", () => {
  it("weekStartOf returns the Monday", () => {
    expect(weekStartOf("2026-09-21")).toBe("2026-09-21"); // Monday
    expect(weekStartOf("2026-09-27")).toBe("2026-09-21"); // Sunday
    expect(weekStartOf("2026-09-04")).toBe("2026-08-31"); // Friday
  });
  it("addDays crosses months", () => {
    expect(addDays("2026-08-31", 6)).toBe("2026-09-06");
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
  });
  it("valueOn picks the latest row on or before the date", () => {
    const rows = [{ effectiveFrom: "2026-08-31", v: 1 }, { effectiveFrom: "2026-09-28", v: 2 }];
    expect(valueOn(rows, "2026-09-27")?.v).toBe(1);
    expect(valueOn(rows, "2026-09-28")?.v).toBe(2);
    expect(valueOn(rows, "2026-08-30")).toBeNull();
  });
  it("settingOn reads effective-dated settings", () => {
    const i = base({ settings: [
      { key: "DEBT_CAP", value: 1, effectiveFrom: "2026-08-31" },
      { key: "DEBT_CAP", value: 0.5, effectiveFrom: "2026-09-28" },
    ] });
    expect(settingOn(i.settings, "DEBT_CAP", "2026-09-21")).toBe(1);
    expect(settingOn(i.settings, "DEBT_CAP", "2026-09-28")).toBe(0.5);
    expect(settingOn(i.settings, "REJECT_ALARM", "2026-09-28")).toBeNull();
  });
});

describe("dayCalc", () => {
  it("pays good blocks at the rate in force that day", () => {
    const i = base();
    const d = dayCalc(i, { date: "2026-09-21", moulded: 1568, broken: 10, attendance: { a: 1, b: 0.5 } });
    expect(d).toMatchObject({ good: 1558, paidBlocks: 1558, rate: 500, payValue: 779000, crewDays: 1.5, weekStart: "2026-09-21" });
  });
  it("applies a break allowance", () => {
    const i = base({ settings: [{ key: "BREAK_ALLOWANCE", value: 0.03, effectiveFrom: "2026-08-31" }] });
    const d = dayCalc(i, { date: "2026-09-21", moulded: 1000, broken: 50, attendance: {} });
    expect(d.paidBlocks).toBe(980); // 1000 - max(0, 50 - 30)
  });
  it("uses the new rate from its start date, mid-week", () => {
    const i = base({ rates: [{ effectiveFrom: "2026-08-31", ratePerBlock: 500 }, { effectiveFrom: "2026-09-23", ratePerBlock: 550 }] });
    expect(dayCalc(i, { date: "2026-09-22", moulded: 100, broken: 0, attendance: {} }).payValue).toBe(50000);
    expect(dayCalc(i, { date: "2026-09-23", moulded: 100, broken: 0, attendance: {} }).payValue).toBe(55000);
  });
  it("has no rate before the first rate date", () => {
    expect(dayCalc(base(), { date: "2026-08-30", moulded: 10, broken: 0, attendance: {} }).rate).toBeNull();
  });
});

describe("computeWeeks", () => {
  it("splits the week's pot by days worked, not day by day", () => {
    const i = base({ days: [
      { date: "2026-09-21", moulded: 1000, broken: 0, attendance: { a: 1, b: 1 } },
      { date: "2026-09-22", moulded: 3000, broken: 0, attendance: { a: 1 } },
      { date: "2026-09-23", moulded: 0, broken: 0, attendance: { b: 0.5 } },
    ] });
    const w = computeWeeks(i).get("2026-09-21")!;
    expect(w.pot).toBe(2000000);
    expect(w.crewDays).toBe(3.5);
    expect(w.days).toEqual({ a: 2, b: 1.5 });
    expect(w.shares).toEqual({ a: xround(2000000 * 2 / 3.5), b: xround(2000000 * 1.5 / 3.5) });
    expect(w.shareDrift).toBe(w.shares.a + w.shares.b - 2000000);
  });
  it("gives 0 shares when the pot has no attendance", () => {
    const i = base({ days: [{ date: "2026-09-21", moulded: 100, broken: 0, attendance: {} }] });
    const w = computeWeeks(i).get("2026-09-21")!;
    expect(w.pot).toBe(50000);
    expect(w.crewDays).toBe(0);
    expect(w.shares).toEqual({});
  });
  it("returns weeks in ascending order", () => {
    const i = base({ days: [
      { date: "2026-09-22", moulded: 1, broken: 0, attendance: { a: 1 } },
      { date: "2026-09-01", moulded: 1, broken: 0, attendance: { a: 1 } },
    ] });
    expect([...computeWeeks(i).keys()]).toEqual(["2026-08-31", "2026-09-21"]);
  });
});
