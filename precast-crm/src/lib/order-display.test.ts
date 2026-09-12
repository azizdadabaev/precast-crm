import { describe, it, expect } from "vitest";
import { displayedDiscount } from "./order-display";

/** An order priced the way `POST /api/orders` stores one: whole-UZS costs, a `Decimal(14,2)`
 *  discount and the total the server struck from them — all serialised as strings by Prisma. */
function costs(o: {
  subtotal: string;
  discount: string;
  delivery?: string;
  other?: string;
  total: string;
}) {
  return {
    roomsSubtotal: o.subtotal,
    discountAmount: o.discount,
    deliveryCost: o.delivery ?? "0",
    otherCost: o.other ?? "0",
    totalPrice: o.total,
  };
}

describe("displayedDiscount", () => {
  /**
   * The reported case: 2,5 % of 15 456 460 is 386 411,50, so the stored discount printed on its
   * own reads «386 412» against a «Жами» struck from 15 370 048,50 — «15 370 049». The customer
   * adding the printed figures gets one UZS less than the price they are asked for.
   */
  it("makes the cost column add up on an exact half", () => {
    const order = costs({
      subtotal: "15456460.00",
      discount: "386411.50",
      delivery: "300000.00",
      total: "15370048.50",
    });
    expect(displayedDiscount(order)).toBe(386_411);
    // The four printed figures agree with the printed «Жами» (15 370 049).
    expect(Math.round(Number(order.roomsSubtotal)) - displayedDiscount(order) + 300_000).toBe(
      15_370_049,
    );
  });

  it("prints a whole discount unchanged", () => {
    expect(
      displayedDiscount(
        costs({
          subtotal: "13542460.00",
          discount: "677123.00",
          delivery: "300000.00",
          total: "13165337.00",
        }),
      ),
    ).toBe(677_123);
  });

  it("derives zero when there is no discount", () => {
    expect(
      displayedDiscount(
        costs({
          subtotal: "13542460.00",
          discount: "0",
          delivery: "300000.00",
          total: "13842460.00",
        }),
      ),
    ).toBe(0);
  });

  it("counts the other cost as well as delivery", () => {
    expect(
      displayedDiscount(
        costs({
          subtotal: "10000001.00",
          discount: "500000.05",
          delivery: "200000.00",
          other: "50000.00",
          total: "9750000.95",
        }),
      ),
    ).toBe(500_000);
  });

  /** A total that was not struck from these components: the derived figure is far from the stored
   *  one, so the stored discount is printed rather than an invented number. */
  it("falls back to the stored discount when the derivation is off by more than 1 UZS", () => {
    expect(
      displayedDiscount(
        costs({
          subtotal: "15456460.00",
          discount: "386411.50",
          delivery: "300000.00",
          total: "15000000.00",
        }),
      ),
    ).toBe(386_412);
  });

  /** A total ABOVE its own subtotal + costs would derive a negative discount. */
  it("falls back to the stored discount when the derivation goes negative", () => {
    expect(
      displayedDiscount(
        costs({ subtotal: "1000000.00", discount: "50000.00", total: "1100000.00" }),
      ),
    ).toBe(50_000);
  });
});
