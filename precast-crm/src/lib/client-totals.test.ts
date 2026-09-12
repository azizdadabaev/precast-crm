import { describe, it, expect } from "vitest";
import { attachTotals, sortByTotal, totalForClient } from "./client-totals";

describe("client totals", () => {
  it("attaches a whole-UZS total per client, zero when the client has no live orders", () => {
    const rows = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
    const groups = [{ clientId: "a", _sum: { totalPrice: "12345678.90" } }];
    expect(attachTotals(rows, groups)).toEqual([
      { id: "a", name: "A", totalBooked: 12345679 },
      { id: "b", name: "B", totalBooked: 0 },
    ]);
  });
  it("gives one client's total by the same rule, and zero when the groupBy found nothing", () => {
    const groups = [
      { clientId: "a", _sum: { totalPrice: "12345678.90" } },
      { clientId: "b", _sum: { totalPrice: "1000000" } },
    ];
    expect(totalForClient("a", groups)).toBe(12345679);
    expect(totalForClient("b", groups)).toBe(1000000);
    // A client whose every order is CANCELED/DRAFT produces no group row at all.
    expect(totalForClient("c", groups)).toBe(0);
    expect(totalForClient("a", [])).toBe(0);
  });
  it("sorts ids by total desc, ties by name asc", () => {
    const ids = sortByTotal(
      [{ id: "a", name: "Zed", totalBooked: 5 }, { id: "b", name: "Alpha", totalBooked: 5 }, { id: "c", name: "Mid", totalBooked: 9 }],
      "desc",
    ).map((r) => r.id);
    expect(ids).toEqual(["c", "b", "a"]);
  });
});
