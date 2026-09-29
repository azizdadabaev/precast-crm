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

import { weeklyPay, balanceAt } from "./engine";

describe("weeklyPay", () => {
  const input = base({
    days: [
      { date: "2026-09-21", moulded: 2000, broken: 0, attendance: { a: 1, b: 1 } }, // pot 1 000 000
      { date: "2026-09-28", moulded: 2000, broken: 0, attendance: { a: 1, b: 1 } },
    ],
    ledger: [
      { id: "1", seq: 1, date: "2026-09-22", workerId: "a", type: "ADVANCE", amount: 800000 }, // a owes 300 000 after wk1
      { id: "2", seq: 2, date: "2026-09-27", workerId: "b", type: "WEEKLY_PAY", amount: 500000 },
    ],
    settings: [
      { key: "DEBT_CAP", value: 1, effectiveFrom: "2026-08-31" },
      { key: "DEBT_CAP", value: 0.5, effectiveFrom: "2026-09-28" },
    ],
  });
  const weeks = computeWeeks(input);

  it("takes the same-week advance in full", () => {
    const a = weeklyPay(input, weeks, "2026-09-21").find((r) => r.workerId === "a")!;
    expect(a).toMatchObject({ earned: 500000, advances: 800000, due: -300000, toPay: 0, carriedForward: -300000, status: "OWES_YOU" });
  });
  it("caps old-debt recovery at the debt cap in force at the week start", () => {
    const a = weeklyPay(input, weeks, "2026-09-28").find((r) => r.workerId === "a")!;
    // G = -300 000, F = 500 000, cap 50 % → recover min(300 000, 250 000) = 250 000
    expect(a).toMatchObject({ broughtForward: -300000, earned: 500000, toPay: 250000, status: "NOT_YET_PAID" });
  });
  it("marks a fully paid worker settled", () => {
    const b = weeklyPay(input, weeks, "2026-09-21").find((r) => r.workerId === "b")!;
    expect(b).toMatchObject({ toPay: 500000, paid: 500000, stillToPay: 0, carriedForward: 0, status: "SETTLED" });
  });
  it("counts a correction in its own column and lowers the balance", () => {
    const i2 = { ...input, ledger: [...input.ledger, { id: "3", seq: 3, date: "2026-09-23", workerId: "b", type: "CORRECTION" as const, amount: -100000 }] };
    const b = weeklyPay(i2, computeWeeks(i2), "2026-09-21").find((r) => r.workerId === "b")!;
    // TO PAY becomes 600 000, 500 000 already paid → 100 000 still to pay
    expect(b).toMatchObject({ corrections: -100000, due: 600000, toPay: 600000, stillToPay: 100000, carriedForward: 100000, status: "NOT_YET_PAID" });
  });
  it("gives a zero row to a worker with no days that week", () => {
    const i3 = base({ days: [{ date: "2026-09-21", moulded: 100, broken: 0, attendance: { a: 1 } }] });
    const b = weeklyPay(i3, computeWeeks(i3), "2026-09-21").find((r) => r.workerId === "b")!;
    expect(b).toMatchObject({ days: 0, earned: 0, toPay: 0, status: "SETTLED", sharePct: 0 });
  });
});

describe("balanceAt", () => {
  it("includes the whole current week's share and all cash up to the date", () => {
    const input = base({
      days: [{ date: "2026-09-21", moulded: 2000, broken: 0, attendance: { a: 1, b: 1 } }],
      ledger: [{ id: "1", seq: 1, date: "2026-09-21", workerId: "a", type: "ADVANCE", amount: 100000 }],
    });
    expect(balanceAt(input, computeWeeks(input), "a", "2026-09-21")).toBe(400000);
  });
});

describe("a cancelled entry is shown in its own column (owner's test 28.09: pay → «Қайтариш» → pay again)", () => {
  // Oybek, week 28.09: owed 275 375; paid it, cancelled that payment, paid again.
  const scenario = base({
    days: [{ date: "2026-09-28", moulded: 1101.5, broken: 0, attendance: { a: 1, b: 1 } }], // pot 550 750 → 275 375 each
    ledger: [
      { id: "p1", seq: 1, date: "2026-09-28", workerId: "a", type: "WEEKLY_PAY", amount: 275375 },
      { id: "c1", seq: 2, date: "2026-09-28", workerId: "a", type: "CORRECTION", amount: -275375, reverses: "WEEKLY_PAY" },
      { id: "p2", seq: 3, date: "2026-09-28", workerId: "a", type: "WEEKLY_PAY", amount: 275375 },
    ],
  });
  it("shows the payment once, not twice, and does not inflate TO PAY", () => {
    const a = weeklyPay(scenario, computeWeeks(scenario), "2026-09-28").find((r) => r.workerId === "a")!;
    expect(a).toMatchObject({ earned: 275375, paid: 275375, corrections: 0, toPay: 275375, stillToPay: 0, carriedForward: 0, status: "SETTLED" });
  });
  it("after only the cancellation, the money is owed again", () => {
    const i = { ...scenario, ledger: scenario.ledger.slice(0, 2) };
    const a = weeklyPay(i, computeWeeks(i), "2026-09-28").find((r) => r.workerId === "a")!;
    expect(a).toMatchObject({ paid: 0, toPay: 275375, stillToPay: 275375, carriedForward: 275375, status: "NOT_YET_PAID" });
  });
  it("a cancelled advance nets out of the advances column", () => {
    const i = base({
      days: [{ date: "2026-09-28", moulded: 1000, broken: 0, attendance: { a: 1 } }],
      ledger: [
        { id: "x1", seq: 1, date: "2026-09-28", workerId: "a", type: "ADVANCE", amount: 300000 },
        { id: "x2", seq: 2, date: "2026-09-28", workerId: "a", type: "CORRECTION", amount: -300000, reverses: "ADVANCE" },
      ],
    });
    const a = weeklyPay(i, computeWeeks(i), "2026-09-28").find((r) => r.workerId === "a")!;
    expect(a).toMatchObject({ advances: 0, corrections: 0, toPay: 500000 });
  });
  it("a plain correction still lands in the corrections column", () => {
    const i = base({
      days: [{ date: "2026-09-28", moulded: 1000, broken: 0, attendance: { a: 1 } }],
      ledger: [{ id: "k", seq: 1, date: "2026-09-28", workerId: "a", type: "CORRECTION", amount: 20000 }],
    });
    expect(weeklyPay(i, computeWeeks(i), "2026-09-28").find((r) => r.workerId === "a")).toMatchObject({ corrections: 20000 });
  });
});
