import { describe, it, expect } from "vitest";
import { computeOrderTotals, restoreDiscountInputs } from "./order-totals";

describe("computeOrderTotals discountMode", () => {
  it("reports AMOUNT when an explicit amount is given", () => {
    const t = computeOrderTotals(
      [],
      { discountPercent: 0, discountAmount: 100, deliveryCost: 0, otherCost: 0 },
      undefined as any,
    );
    expect(t.discountMode).toBe("AMOUNT");
  });
  it("reports PERCENT when only a percent is given", () => {
    const t = computeOrderTotals(
      [],
      { discountPercent: 10, discountAmount: 0, deliveryCost: 0, otherCost: 0 },
      undefined as any,
    );
    expect(t.discountMode).toBe("PERCENT");
  });
});

describe("restoreDiscountInputs", () => {
  it("AMOUNT mode → exact amount, zero percent (the reported bug)", () => {
    expect(restoreDiscountInputs({ discountMode: "AMOUNT", discountPercent: 2.61, discountAmount: 776_400 }))
      .toEqual({ discountPercent: 0, discountAmount: 776_400 });
  });
  it("PERCENT mode → percent, zero amount", () => {
    expect(restoreDiscountInputs({ discountMode: "PERCENT", discountPercent: 10, discountAmount: 62_000 }))
      .toEqual({ discountPercent: 10, discountAmount: 0 });
  });
  it("legacy null + amount>0 → infers AMOUNT", () => {
    expect(restoreDiscountInputs({ discountMode: null, discountPercent: 2.61, discountAmount: 776_400 }))
      .toEqual({ discountPercent: 0, discountAmount: 776_400 });
  });
  it("legacy null + amount 0 + percent>0 → infers PERCENT", () => {
    expect(restoreDiscountInputs({ discountMode: null, discountPercent: 10, discountAmount: 0 }))
      .toEqual({ discountPercent: 10, discountAmount: 0 });
  });
});
