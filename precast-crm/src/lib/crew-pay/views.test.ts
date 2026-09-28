import { describe, it, expect } from "vitest";
import { buildState, overviewView, daysView, ledgerView, payView, defaultPayWeek, workerHistoryView, payslipView } from "./views";
import type { EngineInput } from "./engine";

const input: EngineInput = {
  workers: [
    { id: "a", code: "W01", name: "Ali", status: "ACTIVE", joinedOn: "2026-08-31", leftOn: null },
    { id: "b", code: "W02", name: "Bek", status: "LEFT", joinedOn: "2026-08-31", leftOn: "2026-09-10" },
    { id: "c", code: "W03", name: "Cho", status: "LEFT", joinedOn: "2026-08-31", leftOn: "2026-09-05" },
  ],
  days: [
    { date: "2026-09-01", moulded: 1000, broken: 0, attendance: { a: 1, b: 1, c: 1 } },
    { date: "2026-09-21", moulded: 2000, broken: 20, attendance: { a: 1 } },
  ],
  ledger: [
    { id: "e1", seq: 1, date: "2026-09-02", workerId: "b", type: "ADVANCE", amount: 400000 }, // b over-drawn, then left
    { id: "e2", seq: 2, date: "2026-09-06", workerId: "c", type: "WEEKLY_PAY", amount: 166667 },
    { id: "e3", seq: 3, date: "2026-09-22", workerId: "a", type: "ADVANCE", amount: 100000 },
  ],
  rates: [{ effectiveFrom: "2026-08-31", ratePerBlock: 500 }],
  settings: [{ key: "REJECT_ALARM", value: 0.08, effectiveFrom: "2026-08-31" }],
};
const state = buildState({
  input,
  closedWeekStarts: ["2026-08-31"],
  snapshots: new Map(),
  ledgerMeta: new Map([["e1", { method: "CASH", reason: "Avans", signed: false, reversesEntryId: null }]]),
  workerMeta: new Map(),
  dayNotes: new Map(),
});

describe("views", () => {
  it("overview has the week's KPIs and crew rows", () => {
    const v = overviewView(state, "2026-09-21", "2026-09-23");
    expect(v.kpis).toMatchObject({ moulded: 2000, good: 1980, pot: 990000, crewDays: 1, advancesCount: 1, advancesSum: 100000 });
    expect(v.crew.find((r) => r.workerId === "a")).toMatchObject({ days: 1, earned: 990000, advances: 100000 });
  });
  it("days view has 7 rows Mon–Sun and only workers active that week", () => {
    const v = daysView(state, "2026-09-21");
    expect(v.rows.map((r) => r.date)).toEqual(["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]);
    expect(v.workers.map((w) => w.id)).toEqual(["a"]);
    expect(v.rows[0]).toMatchObject({ moulded: 2000, good: 1980, payValue: 990000, crewDays: 1 });
    expect(v.closed).toBe(false);
    expect(daysView(state, "2026-08-31").closed).toBe(true);
  });
  it("ledger view carries balance-after, names and metadata", () => {
    const v = ledgerView(state, {});
    const e1 = v.entries.find((e) => e.id === "e1")!;
    // 1 000 blocks × 500 over 3 crew-days → 166 667 each; Bek then took 400 000
    expect(e1).toMatchObject({ workerName: "Bek", reason: "Avans", method: "CASH", balanceAfter: 166667 - 400000 });
    expect(v.totals).toEqual({ ADVANCE: 500000, WEEKLY_PAY: 166667, CORRECTION: 0 });
    expect(ledgerView(state, { workerId: "a" }).entries.map((e) => e.id)).toEqual(["e3"]);
  });
  it("pay view keeps a LEFT worker with a balance and hides one with nothing (Review Focus 5)", () => {
    const v = payView(state, "2026-09-21", "2026-09-23");
    expect(v.rows.map((r) => r.workerId)).toEqual(["a", "b"]); // b owes, c settled + left → hidden
    expect(v.closed).toBe(false);
  });
  it("defaults the pay week to the latest week with production that is not closed", () =>
    expect(defaultPayWeek(state, "2026-09-30")).toBe("2026-09-21"));
  it("worker history has one row per week", () => {
    const h = workerHistoryView(state, "a");
    expect(h.weeks.map((w) => w.weekStart)).toEqual(["2026-08-31", "2026-09-21"]);
    expect(h.weeks[1]).toMatchObject({ earned: 990000, advances: 100000 });
  });
  it("payslip lists the week's advances", () => {
    const p = payslipView(state, "2026-09-21", "a");
    expect(p.advances.map((e) => e.amount)).toEqual([100000]);
    expect(p.row.earned).toBe(990000);
  });
});

describe("views mark weeks before the last closed week as locked (final review #1)", () => {
  const s2 = buildState({
    input, closedWeekStarts: ["2026-09-21"], snapshots: new Map(),
    ledgerMeta: new Map(), workerMeta: new Map(), dayNotes: new Map(),
  });
  it("an open week before a closed one is locked for editing", () => {
    expect(daysView(s2, "2026-08-31").closed).toBe(true);
    expect(payView(s2, "2026-08-31", "2026-09-30")).toMatchObject({ closed: false, locked: true, canReopen: false });
    expect(payView(s2, "2026-09-21", "2026-09-30")).toMatchObject({ closed: true, locked: true, canReopen: true });
  });
});

describe("payView tells whether the week has ended (deferred #2)", () => {
  it("is false mid-week and true after Sunday", () => {
    expect(payView(state, "2026-09-21", "2026-09-26").weekEnded).toBe(false);
    expect(payView(state, "2026-09-21", "2026-09-28").weekEnded).toBe(true);
  });
});
