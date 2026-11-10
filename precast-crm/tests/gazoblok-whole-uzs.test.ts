// Owner decision 2026-11-10 (I1): gazoblok money is saved in WHOLE UZS from now on;
// existing rows are not changed. subtotal − discount + delivery + over-load = total, exactly.
import { describe, it, expect } from "vitest";
import { orderTotal } from "@/services/gazoblok-engine";
import { editPlan } from "@/lib/gazoblok-edit";
import { shortCloseTotals } from "@/lib/gazoblok-quantities";
import { computeOvership } from "@/lib/gazoblok-overship";

const whole = (...xs: number[]) => xs.forEach((x) => expect(Number.isInteger(x)).toBe(true));

describe("placement totals", () => {
  // The screenshot's order: 2 017 × 18 000 = 36 306 000 with a 0,02 % discount.
  const lines = [{ unitPrice: 18_000, quantity: 2017 }];

  it("a % discount is rounded to whole UZS and the total stays exact", () => {
    const t = orderTotal(lines, { discountPercent: 0.02 });
    expect(t.discountAmount).toBe(7261); // 7 261,2 → 7 261
    expect(t.total).toBe(36_298_739);
    whole(t.linesSubtotal, t.discountAmount, t.total);
    expect(t.linesSubtotal - t.discountAmount + t.deliveryCost).toBe(t.total);
  });

  it("an 8 000 discount typed as a sum stays 8 000 (0,02 %)", () => {
    const t = orderTotal([{ unitPrice: 18_000, quantity: 2017 }, { unitPrice: 2_000, quantity: 1 }], { discountAmount: 8000 });
    expect(t).toMatchObject({ linesSubtotal: 36_308_000, discountAmount: 8000, discountPercent: 0.02, total: 36_300_000 });
  });

  it("half a sum rounds up", () => {
    expect(orderTotal([{ unitPrice: 15, quantity: 1 }], { discountPercent: 10 }).discountAmount).toBe(2); // 1,5 → 2
  });
});

describe("edit", () => {
  const line = { id: "A", productId: "pA", productLabel: "600×300×200", quantity: 2017, unitPrice: 18000 };
  const products = [{ id: "pA", label: "600×300×200", pricePerBlock: 18000, active: true, lengthM: 0.6, heightM: 0.3, thicknessM: 0.2 }];
  const order = {
    linesSubtotal: 36_306_000, discountPercent: 0.02, discountAmount: 8000, deliveryCost: 0, overshipAmount: 0,
    totalPrice: 36_298_000, scheduledAt: null as Date | null, notes: null as string | null,
  };
  const run = (edit: Parameters<typeof editPlan>[0]["edit"], o: Partial<typeof order> = {}) => {
    const r = editPlan({ order: { ...order, ...o }, lines: [line], shipments: [{ loadedLines: { A: 168 } }], products, edit });
    if ("problem" in r) throw new Error(r.problem.message);
    return r;
  };

  it("a quantity change rescales the discount to whole UZS", () => {
    const r = run({ lines: [{ lineId: "A", productId: "pA", quantity: 2000 }] });
    // 8 000 × 36 000 000 / 36 306 000 = 7 932,57 → 7 933
    expect(r.totals.discountAmount).toBe(7933);
    expect(r.totals.totalPrice).toBe(35_992_067);
    whole(r.totals.discountAmount, r.totals.totalPrice);
  });

  it("a new % discount is whole", () => {
    const r = run({ discountPercent: 0.02 });
    expect(r.totals.discountAmount).toBe(7261);
    expect(r.totals.totalPrice).toBe(36_298_739);
  });

  it("an existing fractional row is left as it is when the edit doesn't touch the money", () => {
    const r = run({ notes: "кейин" }, { discountAmount: 7261.2, totalPrice: 36_298_738.8 });
    expect(r.totals.totalPrice).toBe(36_298_738.8);
    expect(r.changes.map((c) => c.field)).not.toContain("discount");
  });
});

describe("close short and over-load", () => {
  it("close short scales the discount to whole UZS", () => {
    const t = shortCloseTotals([{ id: "A", quantity: 2017, unitPrice: 18000 }], new Map([["A", 2000]]), {
      linesSubtotal: 36_306_000,
      discountAmount: 8000,
      deliveryCost: 150_000,
    });
    expect(t).toEqual({ linesSubtotal: 36_000_000, discountAmount: 7933, overshipAmount: 0, totalPrice: 36_142_067 });
  });

  it("the over-load surcharge is whole UZS", () => {
    const r = computeOvership([{ id: "A", quantity: 10, unitPrice: 1000.5 }], [{ loadedLines: { A: 13 } }]);
    expect(r.overshipAmount).toBe(3002); // 3 × 1 000,5 = 3 001,5 → 3 002
  });
});
