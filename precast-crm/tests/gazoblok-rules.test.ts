import { describe, it, expect } from "vitest";
import { canDeliver, canCancel, paymentCeilingProblem, isOpen, recordPaymentProblem, reviewPaymentProblem, deliveryProofProblem } from "@/lib/gazoblok-rules";

const q = (ordered: number, loaded: number) => ({
  lineId: "A", productId: "pA", label: "600×300×200", ordered, loaded,
  left: Math.max(0, ordered - loaded), over: Math.max(0, loaded - ordered),
});

describe("gazoblok order rules", () => {
  it("canDeliver needs everything loaded (or closed short), trucks delivered and full payment", () => {
    expect(canDeliver({ lines: [q(200, 150)], shortClosed: false, openShipments: 0, remaining: 0 })).toMatch(/юклан/);
    expect(canDeliver({ lines: [q(200, 150)], shortClosed: true, openShipments: 0, remaining: 0 })).toBeNull();
    expect(canDeliver({ lines: [q(200, 200)], shortClosed: false, openShipments: 1, remaining: 0 })).toMatch(/жўнатма/i);
    expect(canDeliver({ lines: [q(200, 200)], shortClosed: false, openShipments: 0, remaining: 10 })).toMatch(/тўлан/);
    expect(canDeliver({ lines: [q(200, 200)], shortClosed: false, openShipments: 0, remaining: 0.004 })).toBeNull();
  });

  it("canDeliver refuses an order with nothing loaded", () => {
    expect(canDeliver({ lines: [q(200, 0)], shortClosed: false, openShipments: 0, remaining: 0 })).not.toBeNull();
  });

  it("canCancel only while nothing has been loaded", () => {
    expect(canCancel({ totalLoaded: 1 })).toMatch(/юкланган/);
    expect(canCancel({ totalLoaded: 0 })).toBeNull();
  });

  it("paymentCeilingProblem formats the remaining balance", () => {
    // formatNumber (the CRM-wide formatter) separates thousands with a non-breaking space.
    expect(paymentCeilingProblem(1000001, 1000000)).toMatch(/1\s000\s000 UZS/);
    expect(paymentCeilingProblem(1000000, 1000000)).toBeNull();
  });

  it("isOpen is false once delivered, cancelled or closed short", () => {
    expect(isOpen({ status: "PLACED", shortClosedAt: null })).toBe(true);
    expect(isOpen({ status: "IN_PRODUCTION", shortClosedAt: null })).toBe(true);
    expect(isOpen({ status: "DELIVERED", shortClosedAt: null })).toBe(false);
    expect(isOpen({ status: "CANCELED", shortClosedAt: null })).toBe(false);
    expect(isOpen({ status: "PLACED", shortClosedAt: new Date() })).toBe(false);
  });

  it("recordPaymentProblem refuses only a cancelled order (closed-short and delivered still take money)", () => {
    expect(recordPaymentProblem({ status: "CANCELED" })).toEqual({ status: 422, message: expect.stringMatching(/Бекор қилинган/) });
    expect(recordPaymentProblem({ status: "PLACED" })).toBeNull();
    expect(recordPaymentProblem({ status: "IN_PRODUCTION" })).toBeNull();
    expect(recordPaymentProblem({ status: "DELIVERED" })).toBeNull();
  });

  it("reviewPaymentProblem refuses approving on a cancelled order; rejecting stays allowed", () => {
    expect(reviewPaymentProblem({ status: "CANCELED" }, true)).toEqual({
      status: 409,
      message: "Буюртма бекор қилинган — тўловни тасдиқлаб бўлмайди · Order is canceled — cannot confirm payment",
    });
    expect(reviewPaymentProblem({ status: "CANCELED" }, false)).toBeNull();
    expect(reviewPaymentProblem({ status: "PLACED" }, true)).toBeNull();
    expect(reviewPaymentProblem({ status: "DELIVERED" }, true)).toBeNull();
  });
});

describe("deliveryProofProblem", () => {
  it("refuses a canceled order and allows every other status", () => {
    expect(deliveryProofProblem({ status: "CANCELED" })).toBe("Бекор қилинган буюртмага сурат қўшиб бўлмайди · Order is canceled");
    for (const status of ["PLACED", "IN_PRODUCTION", "DELIVERED"]) expect(deliveryProofProblem({ status })).toBeNull();
  });
});
