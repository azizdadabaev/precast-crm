import { describe, it, expect } from "vitest";
import { facetsFrom } from "./order-facets";

describe("facetsFrom", () => {
  it("folds Prisma groupBy rows into the mobile facets, zero-filling absent statuses", () => {
    const f = facetsFrom(
      [
        { status: "PLACED", _count: { _all: 1 }, _sum: { totalArea: "36.5" } },
        { status: "DISPATCHED", _count: { _all: 2 }, _sum: { totalArea: "121.3" } },
      ],
      [
        { paymentState: "FULLY_PAID", _count: { _all: 3 } },
        { paymentState: "PARTIALLY_PAID", _count: { _all: 4 } },
        { paymentState: "AWAITING_PAYMENT", _count: { _all: 2 } },
      ],
    );
    expect(f.byStatus).toEqual({
      DRAFT: 0, PLACED: 1, IN_PRODUCTION: 0, LOADED: 0, DISPATCHED: 2, DELIVERED: 0, CANCELED: 0,
    });
    expect(f.byPayment).toEqual({ debt: 6, paid: 3 });
    expect(f.total).toBe(3);
    expect(f.totalArea).toBe(157.8);
  });

  it("is all zeros for an empty result", () => {
    const f = facetsFrom([], []);
    expect(f.total).toBe(0);
    expect(f.totalArea).toBe(0);
    expect(f.byPayment).toEqual({ debt: 0, paid: 0 });
  });
});
