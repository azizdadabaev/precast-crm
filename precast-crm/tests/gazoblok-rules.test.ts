import { describe, it, expect } from "vitest";
import { canDeliver, canCancel, paymentCeilingProblem, isOpen } from "@/lib/gazoblok-rules";

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
});
