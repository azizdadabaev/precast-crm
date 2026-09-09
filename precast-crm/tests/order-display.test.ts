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

  // Regression: paidVariant ignored writeOffAmount, so a settled order
  // (confirmedPaid + writeOffAmount >= totalPrice, which the server's
  // paymentStateFor counts as FULLY_PAID) rendered as "partial" here.
  it("returns 'full' when confirmedPaid + writeOffAmount covers totalPrice", () => {
    expect(paidVariant(800_000, 1_000_000, 200_000)).toBe("full");
    expect(paidVariant("800000", "1000000", "200000")).toBe("full");
  });

  it("stays 'partial' when confirmedPaid + writeOffAmount still falls short", () => {
    expect(paidVariant(500_000, 1_000_000, 200_000)).toBe("partial");
  });

  it("defaults writeOffAmount to 0 when omitted", () => {
    expect(paidVariant(500_000, 1_000_000)).toBe("partial");
  });
});
