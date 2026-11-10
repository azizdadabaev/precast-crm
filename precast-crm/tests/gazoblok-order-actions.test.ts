import { describe, it, expect } from "vitest";
import { nextStatusProblem, closeShortPlan } from "@/lib/gazoblok-rules";
import { lineQuantities } from "@/lib/gazoblok-quantities";
import { refundDue, refundProblem } from "@/lib/overpayment";

const lines = [
  { id: "A", productId: "pA", productLabel: "600×300×200", quantity: 200, unitPrice: 18000 },
  { id: "B", productId: "pB", productLabel: "600×300×300", quantity: 100, unitPrice: 20000 },
];
const all = { edit: true, cancel: true };

function order(over: Record<string, unknown> = {}, shipments = [{ loadedLines: { A: 150 }, status: "DELIVERED" }]) {
  return {
    status: "PLACED",
    shortClosedAt: null,
    lines,
    shipments,
    linesSubtotal: 5600000,
    discountAmount: 560000,
    deliveryCost: 300000,
    confirmedPaid: 3000000,
    totalPrice: 5340000,
    ...over,
  };
}

describe("nextStatusProblem", () => {
  const ctx = (o: ReturnType<typeof order>, remaining = 0) => ({
    status: o.status as string,
    shortClosedAt: o.shortClosedAt as Date | null,
    quantities: lineQuantities(o.lines, o.shipments),
    openShipments: o.shipments.filter((s) => s.status !== "DELIVERED").length,
    remaining,
  });

  it("refuses a no-op change", () => {
    expect(nextStatusProblem(ctx(order()), "PLACED", all)?.status).toBe(409);
  });

  it("refuses delivering when not everything is loaded and the order was not closed short", () => {
    expect(nextStatusProblem(ctx(order()), "DELIVERED", all)?.message).toMatch(/юкланмаган/);
  });

  it("delivers a closed-short order once paid and trucks are delivered", () => {
    expect(nextStatusProblem(ctx(order({ shortClosedAt: new Date() })), "DELIVERED", all)).toBeNull();
  });

  it("refuses cancelling after a load, and without the cancel right", () => {
    expect(nextStatusProblem(ctx(order()), "CANCELED", all)?.message).toMatch(/юкланган/);
    expect(nextStatusProblem(ctx(order({}, [])), "CANCELED", { edit: true, cancel: false })?.status).toBe(403);
    expect(nextStatusProblem(ctx(order({}, [])), "CANCELED", all)).toBeNull();
  });

  it("keeps finished orders final", () => {
    expect(nextStatusProblem(ctx(order({ status: "DELIVERED" })), "PLACED", all)?.status).toBe(409);
    expect(nextStatusProblem(ctx(order({ status: "CANCELED" })), "PLACED", all)?.status).toBe(409);
  });

  it("needs the edit right to move between placed and in production", () => {
    expect(nextStatusProblem(ctx(order({}, [])), "IN_PRODUCTION", { edit: false, cancel: true })?.status).toBe(403);
  });
});

describe("closeShortPlan", () => {
  it("close short re-bills and can create refund owed", () => {
    const p = closeShortPlan(order());
    if ("problem" in p) throw new Error(p.problem);
    expect(p).toMatchObject({ linesSubtotal: 2700000, discountAmount: 270000, totalPrice: 2730000, overshipAmount: 0 });
    expect(refundDue({ status: "PLACED", totalPrice: p.totalPrice, confirmedPaid: 3000000, writeOffAmount: 0 })).toBe(270000);
  });

  it("refuses when nothing was loaded or the order is already closed", () => {
    expect(closeShortPlan(order({}, []))).toHaveProperty("problem");
    expect(closeShortPlan(order({ shortClosedAt: new Date() }))).toHaveProperty("problem");
    expect(closeShortPlan(order({ status: "DELIVERED" }))).toHaveProperty("problem");
  });

  it("refund over what is due is refused", () => {
    expect(refundProblem(270000, 300000)).not.toBeNull();
    expect(refundProblem(270000, 270000)).toBeNull();
  });
});

describe("event labels", () => {
  it("names the Stage 3 order events", async () => {
    const { EVENT_TYPE_LABELS } = await import("@/lib/gazoblok-labels");
    expect(EVENT_TYPE_LABELS.ORDER_EDITED[0]).toBe("Буюртма таҳрирланди");
    expect(EVENT_TYPE_LABELS.ORDER_RESCHEDULED[0]).toBe("Сана ўзгартирилди");
    expect(EVENT_TYPE_LABELS.DELIVERY_LOCATION_SET[0]).toBe("Манзил белгиланди");
    expect(EVENT_TYPE_LABELS.DELIVERY_LOCATION_CLEARED[0]).toBe("Манзил ўчирилди");
  });
});
