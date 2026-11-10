import { describe, it, expect } from "vitest";
import { phoneDigits, buildOrderWhere, parseOrderListQuery, orderFlags } from "@/lib/gazoblok-order-filters";

describe("gazoblok order filters", () => {
  it("phone search is digits-only", () => {
    expect(phoneDigits("+998 90 111 22 33")).toBe("998901112233");
    expect(phoneDigits("111 22")).toBe("11122");
    expect(phoneDigits("90 111 22 33")).toBe("998901112233");
    expect(phoneDigits("12")).toBeNull();
    expect(phoneDigits("Тест")).toBeNull();
    expect(phoneDigits("B-2026")).toBeNull();

    const w = buildOrderWhere(parseOrderListQuery(new URLSearchParams("q=111 22")), null);
    expect(w.OR).toContainEqual({ client: { phone: { contains: "11122" } } });
    expect(w.OR).toContainEqual({ orderNumber: { contains: "111 22", mode: "insensitive" } });
  });

  it("a name search has no phone branch", () => {
    const w = buildOrderWhere(parseOrderListQuery(new URLSearchParams("q=Тест")), null);
    expect(w.OR).toEqual([
      { orderNumber: { contains: "Тест", mode: "insensitive" } },
      { client: { name: { contains: "Тест", mode: "insensitive" } } },
    ]);
  });

  it("empty query has no OR; filters and flagged ids apply", () => {
    const q = parseOrderListQuery(
      new URLSearchParams("status=PLACED&pay=PARTIALLY_PAID&seller=u1&from=2026-11-01&to=2026-11-10"),
    );
    const w = buildOrderWhere(q, ["a", "b"]);
    expect(w.OR).toBeUndefined();
    expect(w.status).toBe("PLACED");
    expect(w.paymentState).toBe("PARTIALLY_PAID");
    expect(w.createdById).toBe("u1");
    expect(w.placedAt).toEqual({ gte: new Date(2026, 10, 1), lt: new Date(2026, 10, 11) });
    expect(w.id).toEqual({ in: ["a", "b"] });
  });

  it("parseOrderListQuery clamps and drops bad values", () => {
    const q = parseOrderListQuery(new URLSearchParams("limit=999&status=BAD&from=2026-11-01&to=nope&flag=x&pay=Y"));
    expect(q.limit).toBe(200);
    expect(q.status).toBeUndefined();
    expect(q.pay).toBeUndefined();
    expect(q.flag).toBeUndefined();
    expect(q.from).toEqual(new Date(2026, 10, 1, 0, 0));
    expect(q.to).toBeUndefined();
    expect(parseOrderListQuery(new URLSearchParams("")).limit).toBe(50);
    expect(parseOrderListQuery(new URLSearchParams("limit=0")).limit).toBe(1);
    expect(parseOrderListQuery(new URLSearchParams("from=2026-02-31")).from).toBeUndefined();
    expect(parseOrderListQuery(new URLSearchParams("flag=refund&cursor=c1")).flag).toBe("refund");
    expect(parseOrderListQuery(new URLSearchParams("cursor=c1")).cursor).toBe("c1");
  });

  it("orderFlags", () => {
    const base = { status: "PLACED", totalPrice: 0, confirmedPaid: 0, overshipAmount: 0, pendingCount: 0 };
    expect(orderFlags({ ...base, status: "CANCELED", totalPrice: 1000000, confirmedPaid: 500000 })).toEqual({
      debt: false,
      refund: true,
      unconfirmed: false,
    });
    expect(orderFlags({ ...base, totalPrice: 4260000, confirmedPaid: 3900000, overshipAmount: 360000 }).debt).toBe(true);
    expect(orderFlags({ ...base, status: "CANCELED", totalPrice: 4260000, overshipAmount: 360000 }).debt).toBe(false);
    expect(orderFlags({ ...base, pendingCount: 1 }).unconfirmed).toBe(true);
    expect(orderFlags({ ...base, totalPrice: 100, confirmedPaid: 100 })).toEqual({
      debt: false,
      refund: false,
      unconfirmed: false,
    });
  });
});

describe("scheduled-day filter (calendar)", () => {
  it("day=YYYY-MM-DD narrows to that local day's scheduledAt", () => {
    const w = buildOrderWhere(parseOrderListQuery(new URLSearchParams("day=2026-11-11")), null);
    expect(w.scheduledAt).toEqual({ gte: new Date(2026, 10, 11), lt: new Date(2026, 10, 12) });
    expect(w.status).toBeUndefined();
  });

  it("day=none lists open orders without a date unless a status is picked", () => {
    expect(buildOrderWhere(parseOrderListQuery(new URLSearchParams("day=none")), null)).toEqual({
      scheduledAt: null,
      status: { in: ["PLACED", "IN_PRODUCTION"] },
    });
    const w = buildOrderWhere(parseOrderListQuery(new URLSearchParams("day=none&status=DELIVERED")), null);
    expect(w.status).toBe("DELIVERED");
  });

  it("drops a malformed day", () => {
    expect(parseOrderListQuery(new URLSearchParams("day=2026-02-30")).day).toBeUndefined();
    expect(parseOrderListQuery(new URLSearchParams("day=tomorrow")).day).toBeUndefined();
  });
});
