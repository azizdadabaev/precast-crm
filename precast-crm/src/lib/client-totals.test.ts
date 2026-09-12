import { describe, it, expect } from "vitest";
import { attachTotals, orderByIds, sortByTotal, totalForClient } from "./client-totals";

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

  it("puts a page's rows back into the order the sort chose", () => {
    // What `findMany({ id: { in: [...] } })` hands back: the database's order, not the ids'.
    const fetched = [
      { id: "b", name: "Beta", _count: { orders: 2 } },
      { id: "c", name: "Gamma", _count: { orders: 9 } },
      { id: "a", name: "Alpha", _count: { orders: 1 } },
    ];
    expect(orderByIds(fetched, ["c", "a", "b"]).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("drops an id whose row vanished between the two queries", () => {
    const fetched = [{ id: "a", name: "Alpha" }];
    expect(orderByIds(fetched, ["a", "gone"])).toEqual([{ id: "a", name: "Alpha" }]);
  });

  it("pages by ids exactly as sorting whole rows then slicing did", () => {
    const rows = [
      { id: "a", name: "Alpha", _count: { orders: 1 } },
      { id: "b", name: "Beta", _count: { orders: 2 } },
      { id: "c", name: "Gamma", _count: { orders: 3 } },
      { id: "d", name: "Delta", _count: { orders: 4 } },
    ];
    const groups = [
      { clientId: "a", _sum: { totalPrice: "5000000" } },
      { clientId: "b", _sum: { totalPrice: "9000000" } },
      { clientId: "d", _sum: { totalPrice: "9000000" } },
    ];
    // The old route: sort the fully-included rows, then slice the page out.
    const wholeRowPage = sortByTotal(attachTotals(rows, groups), "desc").slice(1, 3);
    // The route now: sort `{ id, name }`, slice the ids, fetch (in any order), re-order, attach.
    const keyRows = rows.map((r) => ({ id: r.id, name: r.name }));
    const pageIds = sortByTotal(attachTotals(keyRows, groups), "desc")
      .slice(1, 3)
      .map((r) => r.id);
    const fetchedInDbOrder = rows.filter((r) => pageIds.includes(r.id));
    const idPage = attachTotals(orderByIds(fetchedInDbOrder, pageIds), groups);

    expect(idPage).toEqual(wholeRowPage);
    // …and that page is the second and third by total: b and d tie at 9 000 000 (d first by
    // name), so the slice starts at d and runs into a.
    expect(idPage.map((r) => r.id)).toEqual(["d", "a"]);
  });
});
