import { describe, it, expect } from "vitest";
import {
  EMPTY_FILTERS,
  filtersFromParams,
  filtersToParams,
  hasActiveFilters,
  nextCursor,
  remainingToPay,
  blocksBar,
} from "@/lib/gazoblok-orders-view";

describe("orders list URL filters", () => {
  it("reads known values and drops unknown or malformed ones", () => {
    const f = filtersFromParams(
      new URLSearchParams("q=+111 22+&status=DELIVERED&pay=NOPE&flag=debt&seller=u1&from=2026-11-01&to=11.11.2026"),
    );
    expect(f).toEqual({
      q: "111 22",
      status: "DELIVERED",
      pay: "",
      flag: "debt",
      seller: "u1",
      from: "2026-11-01",
      to: "",
    });
  });

  it("writes only the set filters, so a link reproduces the view", () => {
    const p = filtersToParams({ ...EMPTY_FILTERS, q: " Тест ", flag: "refund", from: "2026-11-01" });
    expect(p.toString()).toBe(new URLSearchParams({ q: "Тест", flag: "refund", from: "2026-11-01" }).toString());
    expect(filtersToParams(EMPTY_FILTERS).toString()).toBe("");
  });

  it("round-trips", () => {
    const f = { ...EMPTY_FILTERS, status: "PLACED" as const, pay: "PARTIALLY_PAID" as const, seller: "u2", to: "2026-11-10" };
    expect(filtersFromParams(filtersToParams(f))).toEqual(f);
  });

  it("knows when any filter is set", () => {
    expect(hasActiveFilters(EMPTY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, q: "  " })).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, seller: "u1" })).toBe(true);
  });
});

describe("paging", () => {
  it("asks for more only while a page came back full", () => {
    expect(nextCursor([{ id: "a" }, { id: "b" }], 2)).toBe("b");
    expect(nextCursor([{ id: "a" }], 2)).toBeUndefined();
    expect(nextCursor([], 2)).toBeUndefined();
  });
});

describe("row figures", () => {
  it("remaining = total − confirmed paid, never negative; cancelled has none", () => {
    expect(remainingToPay({ status: "PLACED", totalPrice: "3510000", confirmedPaid: "1000000" })).toBe(2510000);
    expect(remainingToPay({ status: "DELIVERED", totalPrice: "100", confirmedPaid: "150" })).toBe(0);
    expect(remainingToPay({ status: "CANCELED", totalPrice: "100", confirmedPaid: "0" })).toBeNull();
    expect(remainingToPay({ status: "PLACED", totalPrice: "0.3", confirmedPaid: "0.1" })).toBe(0.2);
  });

  it("blocks bar: loaded part, and the over-load part past the ordered amount", () => {
    expect(blocksBar(168, 200)).toEqual({ fillPct: 84, overPct: 0 });
    expect(blocksBar(0, 0)).toEqual({ fillPct: 0, overPct: 0 });
    expect(blocksBar(220, 200)).toEqual({ fillPct: (200 / 220) * 100, overPct: (20 / 220) * 100 });
  });
});
