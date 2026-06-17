import { describe, it, expect } from "vitest";
import { paymentStateFor, remainingBalance } from "@/lib/payment-state";

describe("paymentStateFor (write-off aware)", () => {
  it("is FULLY_PAID when confirmed alone covers the total", () => {
    expect(paymentStateFor(100, 0, 100)).toBe("FULLY_PAID");
  });

  it("is PARTIALLY_PAID with a leftover and no write-off", () => {
    expect(paymentStateFor(6_240_000, 0, 6_243_820)).toBe("PARTIALLY_PAID");
  });

  it("becomes FULLY_PAID once the leftover is written off", () => {
    // 6,240,000 paid + 3,820 written off == 6,243,820 total
    expect(paymentStateFor(6_240_000, 3_820, 6_243_820)).toBe("FULLY_PAID");
  });

  it("is AWAITING_PAYMENT with nothing paid", () => {
    expect(paymentStateFor(0, 0, 100)).toBe("AWAITING_PAYMENT");
  });
});

describe("remainingBalance (write-off aware)", () => {
  it("subtracts the written-off amount", () => {
    expect(remainingBalance(6_243_820, 6_240_000, 3_820)).toBe(0);
  });

  it("subtracts pending on top of confirmed + write-off", () => {
    expect(remainingBalance(100, 40, 10, 20)).toBe(30);
  });

  it("clamps at zero, never negative", () => {
    expect(remainingBalance(100, 90, 50)).toBe(0);
  });
});
