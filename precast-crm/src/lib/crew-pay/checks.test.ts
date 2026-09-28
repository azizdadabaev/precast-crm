import { describe, it, expect } from "vitest";
import { runChecks, closeBlockers } from "./checks";
import { computeWeeks, type EngineInput } from "./engine";

const mk = (over: Partial<EngineInput>): EngineInput => ({
  workers: [{ id: "a", code: "W01", name: "Ali", status: "ACTIVE", joinedOn: "2026-08-31", leftOn: null }],
  days: [], ledger: [],
  rates: [{ effectiveFrom: "2026-08-31", ratePerBlock: 500 }],
  settings: [{ key: "REJECT_ALARM", value: 0.08, effectiveFrom: "2026-08-31" }],
  ...over,
});
const codes = (i: EngineInput, today = "2026-09-28") => runChecks(i, computeWeeks(i), today).map((x) => x.code);

describe("runChecks", () => {
  it("is clean for a normal week", () =>
    expect(codes(mk({ days: [{ date: "2026-09-21", moulded: 100, broken: 1, attendance: { a: 1 } }] }))).toEqual([]));
  it("errors when there is no rate at all", () => expect(codes(mk({ rates: [] }))).toContain("NO_RATE"));
  it("errors when blocks have nobody present", () =>
    expect(codes(mk({ days: [{ date: "2026-09-21", moulded: 100, broken: 0, attendance: {} }] }))).toContain("NOBODY_PRESENT"));
  it("errors on attendance for a worker not active that day", () =>
    expect(codes(mk({
      workers: [{ id: "a", code: "W01", name: "Ali", status: "LEFT", joinedOn: "2026-08-31", leftOn: "2026-09-20" }],
      days: [{ date: "2026-09-21", moulded: 100, broken: 0, attendance: { a: 1 } }],
    }))).toContain("INACTIVE_WORKER"));
  it("warns on a high reject rate", () =>
    expect(codes(mk({ days: [{ date: "2026-09-21", moulded: 100, broken: 20, attendance: { a: 1 } }] }))).toContain("REJECT_HIGH"));
  it("warns on attendance with no blocks", () =>
    expect(codes(mk({ days: [{ date: "2026-09-21", moulded: null, broken: 0, attendance: { a: 1 } }] }))).toContain("ATTENDANCE_NO_BLOCKS"));
  it("warns when an advance exceeds what was earned", () =>
    expect(codes(mk({ ledger: [{ id: "1", seq: 1, date: "2026-09-21", workerId: "a", type: "ADVANCE", amount: 100 }] }))).toContain("ADVANCE_OVER_BALANCE"));
  it("warns when a finished week is unpaid 14 days after it ends", () => {
    const i = mk({ days: [{ date: "2026-09-01", moulded: 100, broken: 0, attendance: { a: 1 } }] });
    expect(codes(i, "2026-09-20")).toContain("WEEK_UNPAID");     // week ended 06.09, +14 = 20.09
    expect(codes(i, "2026-09-19")).not.toContain("WEEK_UNPAID");
  });
  it("does not call a week unpaid when it was paid late, in the following week (live data: 31.08 paid on 09.09)", () => {
    const i = mk({
      days: [{ date: "2026-09-01", moulded: 100, broken: 0, attendance: { a: 1 } }], // earns 50 000 in week 31.08
      ledger: [{ id: "1", seq: 1, date: "2026-09-08", workerId: "a", type: "WEEKLY_PAY", amount: 50000 }], // paid next week
    });
    expect(codes(i, "2026-09-28")).not.toContain("WEEK_UNPAID");
  });
  it("still warns while money earned over 14 days ago remains unpaid", () => {
    const i = mk({
      days: [{ date: "2026-09-01", moulded: 100, broken: 0, attendance: { a: 1 } }],
      ledger: [{ id: "1", seq: 1, date: "2026-09-08", workerId: "a", type: "WEEKLY_PAY", amount: 30000 }],
    });
    const issue = runChecks(i, computeWeeks(i), "2026-09-28").find((x) => x.code === "WEEK_UNPAID");
    expect(issue?.message).toContain("20 000");
  });
  it("warns on debt older than 30 days", () => {
    const i = mk({ ledger: [{ id: "1", seq: 1, date: "2026-09-01", workerId: "a", type: "ADVANCE", amount: 100 }] });
    expect(codes(i, "2026-10-02")).toContain("OLD_DEBT");
    expect(codes(i, "2026-09-20")).not.toContain("OLD_DEBT");
  });
  it("warns on a rate cut", () =>
    expect(codes(mk({ rates: [{ effectiveFrom: "2026-08-31", ratePerBlock: 500 }, { effectiveFrom: "2026-10-05", ratePerBlock: 450 }] }))).toContain("RATE_CUT"));
});

describe("closeBlockers", () => {
  it("blocks closing a week with an error in it or before it, not after it", () => {
    const i = mk({ days: [{ date: "2026-09-22", moulded: 100, broken: 0, attendance: {} }] });
    const issues = runChecks(i, computeWeeks(i), "2026-09-28");
    expect(closeBlockers(issues, "2026-09-21")).toHaveLength(1);
    expect(closeBlockers(issues, "2026-09-14")).toHaveLength(0);
  });
});

describe("OLD_DEBT needs continuous debt (deferred #5)", () => {
  it("does not warn when the debt was cleared in between and came back", () => {
    const i = mk({
      days: [{ date: "2026-09-15", moulded: 1000, broken: 0, attendance: { a: 1 } }], // earns 500 000 → clears the debt
      ledger: [
        { id: "1", seq: 1, date: "2026-09-01", workerId: "a", type: "ADVANCE", amount: 100000 },
        { id: "2", seq: 2, date: "2026-09-29", workerId: "a", type: "ADVANCE", amount: 900000 },
      ],
    });
    expect(codes(i, "2026-10-02")).not.toContain("OLD_DEBT");
  });
  it("still warns when the debt never cleared for 30 days", () => {
    const i = mk({ ledger: [{ id: "1", seq: 1, date: "2026-09-01", workerId: "a", type: "ADVANCE", amount: 100000 }] });
    expect(codes(i, "2026-10-02")).toContain("OLD_DEBT");
  });
});
