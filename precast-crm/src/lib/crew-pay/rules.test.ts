import { describe, it, expect } from "vitest";
import {
  CrewPayError, todayTashkent, clampToWeek, assertWeeksOpen, assertEffectiveDateAllowed,
  validateDayWrite, validateLedgerWrite, planPayments,
} from "./rules";
import type { EngineInput } from "./engine";
import { fmtSom, fmtDay } from "./format";

const input: EngineInput = {
  workers: [
    { id: "a", code: "W01", name: "A", status: "ACTIVE", joinedOn: "2026-08-31", leftOn: null },
    { id: "b", code: "W02", name: "B", status: "LEFT", joinedOn: "2026-08-31", leftOn: "2026-09-23" },
  ],
  days: [], ledger: [],
  rates: [{ effectiveFrom: "2026-08-31", ratePerBlock: 500 }],
  settings: [],
};

describe("format", () => {
  it("formats so'm with spaces and a minus sign", () => {
    expect(fmtSom(5928500)).toBe("5 928 500");
    expect(fmtSom(-1686875)).toBe("−1 686 875");
    expect(fmtSom(0)).toBe("0");
  });
  it("formats a day", () => expect(fmtDay("2026-09-04")).toBe("04.09"));
});

describe("todayTashkent", () => {
  it("uses Asia/Tashkent, not UTC", () => {
    expect(todayTashkent(new Date("2026-09-27T20:30:00Z"))).toBe("2026-09-28"); // 01:30 in Tashkent
    expect(todayTashkent(new Date("2026-09-28T10:00:00Z"))).toBe("2026-09-28");
  });
});

describe("clampToWeek (Review Focus 1)", () => {
  it("dates a Monday payment for last week on last week's Sunday", () => {
    expect(clampToWeek("2026-09-28", "2026-09-21")).toBe("2026-09-27");
  });
  it("keeps a date inside the week", () => expect(clampToWeek("2026-09-24", "2026-09-21")).toBe("2026-09-24"));
  it("moves an early date to the Monday", () => expect(clampToWeek("2026-09-20", "2026-09-21")).toBe("2026-09-21"));
});

describe("week guards (Review Focus 4)", () => {
  const closed = new Set(["2026-09-14", "2026-09-21"]);
  it("rejects writes into a closed week with 409", () => {
    expect(() => assertWeeksOpen(closed, ["2026-09-23"])).toThrowError(CrewPayError);
    try { assertWeeksOpen(closed, ["2026-09-23"]); } catch (e) { expect((e as CrewPayError).status).toBe(409); }
    expect(() => assertWeeksOpen(closed, ["2026-09-28"])).not.toThrow();
  });
  it("rejects a rate/setting dated on or before the last closed week", () => {
    expect(() => assertEffectiveDateAllowed(closed, "2026-09-27")).toThrowError(CrewPayError);
    expect(() => assertEffectiveDateAllowed(closed, "2026-09-10")).toThrowError(CrewPayError);
    expect(() => assertEffectiveDateAllowed(closed, "2026-09-28")).not.toThrow();
  });
});

describe("validateDayWrite (Review Focus 2)", () => {
  const ok = { date: "2026-09-22", moulded: 100, broken: 0, attendance: { a: 1 } };
  it("accepts a normal day", () => expect(() => validateDayWrite(ok, input, {})).not.toThrow());
  it("rejects more broken than moulded", () =>
    expect(() => validateDayWrite({ ...ok, broken: 101 }, input, {})).toThrowError(/Синган/));
  it("rejects attendance other than 1 or 0.5", () =>
    expect(() => validateDayWrite({ ...ok, attendance: { a: 2 } }, input, {})).toThrowError(/Давомат/));
  it("rejects attendance for a worker after their left date", () =>
    expect(() => validateDayWrite({ ...ok, date: "2026-09-24", attendance: { b: 1 } }, input, {})).toThrowError(/ишламаётган/));
  it("rejects a date before the first week", () =>
    expect(() => validateDayWrite({ ...ok, date: "2026-08-30" }, input, {})).toThrowError(/31\.08/));
  it("rejects blocks with nobody present unless confirmed", () => {
    expect(() => validateDayWrite({ ...ok, attendance: {} }, input, {})).toThrowError(/ҳеч ким/);
    expect(() => validateDayWrite({ ...ok, attendance: {} }, input, { confirmNoAttendance: true })).not.toThrow();
  });
  it("rejects blocks on a date with no rate", () => {
    const noRate = { ...input, rates: [{ effectiveFrom: "2026-10-01", ratePerBlock: 500 }] };
    expect(() => validateDayWrite(ok, noRate, {})).toThrowError(/ставка/);
  });
});

describe("validateLedgerWrite", () => {
  const base = { date: "2026-09-22", workerId: "a", type: "ADVANCE" as const, amount: 100000 };
  it("accepts a positive advance", () => expect(() => validateLedgerWrite(base)).not.toThrow());
  it("rejects zero or negative unless it is a correction", () => {
    expect(() => validateLedgerWrite({ ...base, amount: 0 })).toThrowError(CrewPayError);
    expect(() => validateLedgerWrite({ ...base, amount: -5 })).toThrowError(/Тузатиш/);
    expect(() => validateLedgerWrite({ ...base, type: "CORRECTION", amount: -5 })).not.toThrow();
    expect(() => validateLedgerWrite({ ...base, type: "CORRECTION", amount: 0 })).toThrowError(CrewPayError);
  });
  it("rejects a date before the first week", () =>
    expect(() => validateLedgerWrite({ ...base, date: "2026-08-01" })).toThrowError(CrewPayError));
});

describe("planPayments (Review Focus 3)", () => {
  it("drops requests whose clientKey already exists or repeats", () => {
    const reqs = [
      { workerId: "a", amount: 100, method: "CASH" as const, clientKey: "k1" },
      { workerId: "a", amount: 100, method: "CASH" as const, clientKey: "k1" },
      { workerId: "b", amount: 50, method: "CASH" as const, clientKey: "k2" },
      { workerId: "c", amount: 0, method: "CASH" as const, clientKey: "k3" },
    ];
    expect(planPayments(new Set(["k2"]), reqs).map((r) => r.clientKey)).toEqual(["k1"]);
  });
});

import { isLocked, assertCanReopen } from "./rules";

describe("closed weeks lock everything before them (final review #1)", () => {
  const closed = new Set(["2026-09-14", "2026-09-21"]);
  it("rejects a write into an OPEN week that lies before the last closed week", () => {
    // Editing 07.09 would silently change 14.09 / 21.09's brought-forward and TO PAY.
    const open = new Set(["2026-09-21"]); // 07.09 and 14.09 were never closed / were reopened
    expect(() => assertWeeksOpen(open, ["2026-09-08"])).toThrowError(/21\.09/);
    try { assertWeeksOpen(open, ["2026-09-08"]); } catch (e) { expect((e as CrewPayError).status).toBe(409); }
  });
  it("isLocked is true up to the end of the last closed week only", () => {
    expect(isLocked(closed, "2026-09-01")).toBe(true);
    expect(isLocked(closed, "2026-09-27")).toBe(true);
    expect(isLocked(closed, "2026-09-28")).toBe(false);
    expect(isLocked(new Set(), "2026-09-01")).toBe(false);
  });
  it("only the latest closed week can be reopened", () => {
    expect(() => assertCanReopen(closed, "2026-09-14")).toThrowError(/21\.09/);
    expect(() => assertCanReopen(closed, "2026-09-21")).not.toThrow();
  });
});

describe("fmtSom rounds fractional so'm for display", () => {
  it("rounds half away from zero and never shows −0", () => {
    expect(fmtSom(785295.2)).toBe("785 295");
    expect(fmtSom(785295.5)).toBe("785 296");
    expect(fmtSom(-0.2)).toBe("0");
  });
});
