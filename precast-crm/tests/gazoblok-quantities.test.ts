import { describe, it, expect } from "vitest";
import {
  lineQuantities,
  loadDelta,
  overloadLines,
  unpaidOverload,
  shortCloseTotals,
  parseDecimal,
} from "@/lib/gazoblok-quantities";

const lines = [
  { id: "A", productId: "pA", productLabel: "600×300×200", quantity: 200, unitPrice: 18000 },
  { id: "B", productId: "pB", productLabel: "600×300×300", quantity: 100, unitPrice: 20000 },
];

describe("gazoblok quantities", () => {
  it("lineQuantities sums loads per line and ignores unknown line ids", () => {
    const q = lineQuantities(lines, [{ loadedLines: { A: 150 } }, { loadedLines: { A: 250, B: 100, ghost: 5 } }]);
    expect(q).toEqual([
      { lineId: "A", productId: "pA", label: "600×300×200", ordered: 200, loaded: 400, left: 0, over: 200 },
      { lineId: "B", productId: "pB", label: "600×300×300", ordered: 100, loaded: 100, left: 0, over: 0 },
    ]);
  });

  it("lineQuantities shows what is left before trucks go", () => {
    const q = lineQuantities(lines, [{ loadedLines: { A: 50 } }, { loadedLines: null }]);
    expect(q[0]).toMatchObject({ loaded: 50, left: 150, over: 0 });
    expect(q[1]).toMatchObject({ loaded: 0, left: 100, over: 0 });
  });

  it("loadDelta is the per-line change of a correction", () => {
    expect(loadDelta({ A: 150 }, { A: 120, B: 10 })).toEqual({ A: -30, B: 10 });
    expect(loadDelta(null, { A: 5 })).toEqual({ A: 5 });
    expect(loadDelta({ A: 5 }, { A: 5 })).toEqual({});
  });

  it("overloadLines reports lines this load pushes past the order", () => {
    expect(overloadLines(lines, [{ loadedLines: { A: 150 } }], { A: 100 })).toEqual([{ lineId: "A", extra: 50 }]);
    expect(overloadLines(lines, [{ loadedLines: { A: 150 } }], { A: 50 })).toEqual([]);
  });

  it("unpaidOverload treats the extra as the last money in", () => {
    expect(unpaidOverload({ overshipAmount: 900000, totalPrice: 5000000, confirmedPaid: 4500000 })).toBe(500000);
    expect(unpaidOverload({ overshipAmount: 900000, totalPrice: 5000000, confirmedPaid: 4000000 })).toBe(900000);
    expect(unpaidOverload({ overshipAmount: 900000, totalPrice: 5000000, confirmedPaid: 5000000 })).toBe(0);
  });

  it("shortCloseTotals re-bills on loaded blocks with the discount scaled", () => {
    const t = shortCloseTotals(lines, new Map([["A", 150]]), {
      linesSubtotal: 5600000,
      discountAmount: 560000,
      deliveryCost: 300000,
    });
    expect(t).toEqual({ linesSubtotal: 2700000, discountAmount: 270000, overshipAmount: 0, totalPrice: 2730000 });
  });

  it("shortCloseTotals keeps an over-loaded line's extra at full price (debt stays visible)", () => {
    const mixed = [
      { id: "A", quantity: 100, unitPrice: 10 },
      { id: "B", quantity: 100, unitPrice: 10 },
    ];
    const t = shortCloseTotals(mixed, new Map([["A", 50], ["B", 150]]), {
      linesSubtotal: 2000,
      discountAmount: 200,
      deliveryCost: 0,
    });
    // Billed on min(loaded, ordered) = 50 + 100 → 1 500, discount 10 % → 150; extra 50 × 10 at full price.
    expect(t).toEqual({ linesSubtotal: 1500, discountAmount: 150, overshipAmount: 500, totalPrice: 1850 });
  });

  it("parseDecimal accepts a decimal comma", () => {
    expect(parseDecimal("7,5")).toBe(7.5);
    expect(parseDecimal("7.5")).toBe(7.5);
    expect(parseDecimal(" 7 ")).toBe(7);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("7,5,1")).toBeNull();
  });
});

describe("clientNamePlan — never rename a client silently", async () => {
  const { clientNamePlan } = await import("@/lib/gazoblok-quantities");
  it("same name (ignoring spaces and case) needs no question", () => {
    expect(clientNamePlan("Тохиржон Ака", " тохиржон  ака ")).toBe("same");
  });
  it("a different name asks first", () => {
    expect(clientNamePlan("Тохиржон", "Анвар")).toBe("ask");
  });
  it("follows the operator's answer", () => {
    expect(clientNamePlan("Тохиржон", "Анвар", "keep")).toBe("keep");
    expect(clientNamePlan("Тохиржон", "Анвар", "update")).toBe("update");
  });
});
