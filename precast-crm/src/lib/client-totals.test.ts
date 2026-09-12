import { describe, it, expect } from "vitest";
import { attachTotals, sortByTotal } from "./client-totals";

describe("client totals", () => {
  it("attaches a whole-UZS total per client, zero when the client has no live orders", () => {
    const rows = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
    const groups = [{ clientId: "a", _sum: { totalPrice: "12345678.90" } }];
    expect(attachTotals(rows, groups)).toEqual([
      { id: "a", name: "A", totalBooked: 12345679 },
      { id: "b", name: "B", totalBooked: 0 },
    ]);
  });
  it("sorts ids by total desc, ties by name asc", () => {
    const ids = sortByTotal(
      [{ id: "a", name: "Zed", totalBooked: 5 }, { id: "b", name: "Alpha", totalBooked: 5 }, { id: "c", name: "Mid", totalBooked: 9 }],
      "desc",
    ).map((r) => r.id);
    expect(ids).toEqual(["c", "b", "a"]);
  });
});
