import { describe, it, expect } from "vitest";
import { issueHref } from "./links";

describe("issueHref (a check links to the rows it is about)", () => {
  it("sends day problems to that week of the daily log", () =>
    expect(issueHref({ level: "error", code: "NOBODY_PRESENT", message: "", date: "2026-09-22", weekStart: "2026-09-21" }))
      .toBe("/crew-pay/days?week=2026-09-21"));
  it("sends a worker's money warnings to their ledger", () => {
    expect(issueHref({ level: "warning", code: "ADVANCE_OVER_BALANCE", message: "", workerId: "w1", weekStart: "2026-09-21" }))
      .toBe("/crew-pay/ledger?worker=w1");
    expect(issueHref({ level: "warning", code: "OLD_DEBT", message: "", workerId: "w1" })).toBe("/crew-pay/ledger?worker=w1");
    expect(issueHref({ level: "warning", code: "WEEK_UNPAID", message: "", workerId: "w1" })).toBe("/crew-pay/pay");
  });
  it("sends rate problems to settings", () => {
    expect(issueHref({ level: "error", code: "NO_RATE", message: "" })).toBe("/crew-pay/settings");
    expect(issueHref({ level: "warning", code: "RATE_CUT", message: "", date: "2026-10-05" })).toBe("/crew-pay/settings");
  });
  it("sends week-level problems to that payday week", () =>
    expect(issueHref({ level: "error", code: "SHARE_DRIFT", message: "", weekStart: "2026-09-21" })).toBe("/crew-pay/pay?week=2026-09-21"));
});
