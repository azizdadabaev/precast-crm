import { describe, it, expect } from "vitest";
import { parseMovementQuery, pageOf } from "@/lib/gazoblok-stock-movements";

describe("parseMovementQuery", () => {
  it("defaults: limit 50, no filters", () => {
    expect(parseMovementQuery(new URLSearchParams(""))).toEqual({ limit: 50 });
  });

  it("keeps a known reason, product and cursor; clamps limit", () => {
    expect(
      parseMovementQuery(new URLSearchParams("productId=p1&reason=SHIPMENT_LOAD&cursor=m9&limit=999")),
    ).toEqual({ productId: "p1", reason: "SHIPMENT_LOAD", cursor: "m9", limit: 200 });
    expect(parseMovementQuery(new URLSearchParams("limit=0")).limit).toBe(1);
  });

  it("drops an unknown reason and a junk limit", () => {
    expect(parseMovementQuery(new URLSearchParams("reason=DROP&limit=abc"))).toEqual({ limit: 50 });
  });
});

describe("pageOf", () => {
  it("a page with one extra row has a next cursor = last kept id", () => {
    expect(pageOf([{ id: "a" }, { id: "b" }, { id: "c" }], 2)).toEqual({
      items: [{ id: "a" }, { id: "b" }],
      nextCursor: "b",
    });
  });

  it("a short page ends the list", () => {
    expect(pageOf([{ id: "a" }], 2)).toEqual({ items: [{ id: "a" }], nextCursor: null });
    expect(pageOf([{ id: "a" }, { id: "b" }], 2)).toEqual({ items: [{ id: "a" }, { id: "b" }], nextCursor: null });
  });
});
