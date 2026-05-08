import { describe, it, expect } from "vitest";
import { paidVariant } from "../src/lib/order-display";

describe("paidVariant", () => {
  it("returns 'zero' when confirmedPaid is 0", () => {
    expect(paidVariant(0, 1_000_000)).toBe("zero");
    expect(paidVariant("0", "1000000")).toBe("zero");
  });

  it("returns 'partial' when 0 < confirmedPaid < totalPrice", () => {
    expect(paidVariant(500_000, 1_000_000)).toBe("partial");
    expect(paidVariant("500000", "1000000")).toBe("partial");
  });

  it("returns 'full' when confirmedPaid >= totalPrice", () => {
    expect(paidVariant(1_000_000, 1_000_000)).toBe("full");
    expect(paidVariant("1000000", "1000000")).toBe("full");
  });
});
