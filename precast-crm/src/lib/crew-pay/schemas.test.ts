import { describe, it, expect } from "vitest";
import { DayBody, LedgerBody, PayBody, WeekStartSchema, SettingBody, ReopenBody } from "./schemas";

describe("crew pay request schemas", () => {
  it("accepts a day and normalises absent attendance", () => {
    const d = DayBody.parse({ date: "2026-09-22", moulded: 1876, broken: 0, attendance: { a: 1, b: 0.5 } });
    expect(d.attendance).toEqual({ a: 1, b: 0.5 });
  });
  it("rejects negative or fractional block counts", () => {
    expect(DayBody.safeParse({ date: "2026-09-22", moulded: -1, broken: 0, attendance: {} }).success).toBe(false);
    expect(DayBody.safeParse({ date: "2026-09-22", moulded: 1.5, broken: 0, attendance: {} }).success).toBe(false);
  });
  it("rejects a malformed date", () =>
    expect(LedgerBody.safeParse({ date: "22.09.2026", workerId: "a", type: "ADVANCE", amount: 1, method: "CASH" }).success).toBe(false));
  it("requires a Monday for a week start", () => {
    expect(WeekStartSchema.safeParse("2026-09-21").success).toBe(true);
    expect(WeekStartSchema.safeParse("2026-09-22").success).toBe(false);
  });
  it("requires a clientKey on each payment", () =>
    expect(PayBody.safeParse({ payments: [{ workerId: "a", amount: 1, method: "CASH" }] }).success).toBe(false));
  it("keeps settings in 0..1", () =>
    expect(SettingBody.safeParse({ key: "DEBT_CAP", value: 1.5, effectiveFrom: "2026-10-05" }).success).toBe(false));
  it("requires a reason to reopen a week", () => {
    expect(ReopenBody.safeParse({ reason: "" }).success).toBe(false);
    expect(ReopenBody.safeParse({ reason: "Oybek sanog'i xato" }).success).toBe(true);
  });
});

describe("deferred #4 and #8", () => {
  it("records weekly pay only through the Pay button, not the ledger form", () =>
    expect(LedgerBody.safeParse({ date: "2026-09-22", workerId: "a", type: "WEEKLY_PAY", amount: 1, method: "CASH" }).success).toBe(false));
  it("still accepts advances and corrections", () => {
    expect(LedgerBody.safeParse({ date: "2026-09-22", workerId: "a", type: "ADVANCE", amount: 1, method: "CASH" }).success).toBe(true);
    expect(LedgerBody.safeParse({ date: "2026-09-22", workerId: "a", type: "CORRECTION", amount: -1, method: "CASH" }).success).toBe(true);
  });
  it("rejects a typo-sized amount with an Uzbek message", () => {
    const r = LedgerBody.safeParse({ date: "2026-09-22", workerId: "a", type: "ADVANCE", amount: 5_000_000_000, method: "CASH" });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r)).toMatch(/Сумма жуда катта/);
    expect(PayBody.safeParse({ payments: [{ workerId: "a", amount: 5_000_000_000, method: "CASH", clientKey: "abcdefgh" }] }).success).toBe(false);
  });
});
