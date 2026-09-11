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
        { paymentState: "FULLY_PAID", status: "DELIVERED", _count: { _all: 3 } },
        { paymentState: "PARTIALLY_PAID", status: "DISPATCHED", _count: { _all: 4 } },
        { paymentState: "AWAITING_PAYMENT", status: "PLACED", _count: { _all: 2 } },
      ],
    );
    expect(f.byStatus).toEqual({
      DRAFT: 0, PLACED: 1, IN_PRODUCTION: 0, LOADED: 0, DISPATCHED: 2, DELIVERED: 0, CANCELED: 0,
    });
    expect(f.byPayment).toEqual({ debt: 6, paid: 3 });
    expect(f.total).toBe(3);
    expect(f.totalArea).toBe(157.8);
  });

  it("counts a canceled group in byStatus and total but never in byPayment", () => {
    const f = facetsFrom(
      [
        { status: "PLACED", _count: { _all: 2 }, _sum: { totalArea: "40.0" } },
        { status: "CANCELED", _count: { _all: 5 }, _sum: { totalArea: "90.0" } },
        { status: "DRAFT", _count: { _all: 1 }, _sum: { totalArea: "10.0" } },
      ],
      [
        { paymentState: "AWAITING_PAYMENT", status: "PLACED", _count: { _all: 2 } },
        // A canceled order keeps whatever payment state it had; it owes nothing all the same.
        { paymentState: "AWAITING_PAYMENT", status: "CANCELED", _count: { _all: 4 } },
        { paymentState: "PARTIALLY_PAID", status: "CANCELED", _count: { _all: 1 } },
        { paymentState: "AWAITING_PAYMENT", status: "DRAFT", _count: { _all: 1 } },
      ],
    );
    // The chips count every status, «Бекор қилинган» included — that chip is how an operator
    // finds a canceled order at all.
    expect(f.byStatus.CANCELED).toBe(5);
    expect(f.byStatus.DRAFT).toBe(1);
    expect(f.byStatus.PLACED).toBe(2);
    expect(f.total).toBe(8);
    expect(f.totalArea).toBe(140);
    // «Қарз» / «Тўланган» count live money only: the two PLACED orders and nothing else.
    expect(f.byPayment).toEqual({ debt: 2, paid: 0 });
  });

  it("counts a paid live order in byPayment.paid but not a paid canceled one", () => {
    const f = facetsFrom(
      [{ status: "DELIVERED", _count: { _all: 1 }, _sum: { totalArea: "12.0" } }],
      [
        { paymentState: "FULLY_PAID", status: "DELIVERED", _count: { _all: 1 } },
        { paymentState: "FULLY_PAID", status: "CANCELED", _count: { _all: 7 } },
      ],
    );
    expect(f.byPayment).toEqual({ debt: 0, paid: 1 });
  });

  it("is all zeros for an empty result", () => {
    const f = facetsFrom([], []);
    expect(f.total).toBe(0);
    expect(f.totalArea).toBe(0);
    expect(f.byPayment).toEqual({ debt: 0, paid: 0 });
  });
});
