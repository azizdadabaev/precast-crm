import { describe, it, expect } from "vitest";
import { planLoad } from "@/lib/gazoblok-quantities";
import { overloadRefusal } from "@/lib/gazoblok-rules";

const lines = [
  { id: "A", productId: "pA", quantity: 200 },
  { id: "B", productId: "pB", quantity: 100 },
];

describe("planLoad — one truck load or correction", () => {
  it("first load writes the blocks off stock", () => {
    const p = planLoad({ lines, otherShipments: [], prevLoaded: null, postedForShipment: {}, nextLoaded: { A: 150 } });
    expect(p).toEqual({ unknownLineIds: [], overload: [], stockMoves: [{ productId: "pA", change: -150 }] });
  });

  it("correction posts the difference", () => {
    const p = planLoad({ lines, otherShipments: [], prevLoaded: { A: 150 }, postedForShipment: { pA: -150 }, nextLoaded: { A: 120, B: 10 } });
    expect(p.stockMoves).toEqual([
      { productId: "pA", change: 30 },
      { productId: "pB", change: -10 },
    ]);
  });

  it("first touch of a pre-switch shipment writes off its full count once", () => {
    const p = planLoad({ lines, otherShipments: [], prevLoaded: { A: 150 }, postedForShipment: {}, nextLoaded: { A: 150 } });
    expect(p.stockMoves).toEqual([{ productId: "pA", change: -150 }]);
  });

  it("removing a size from a truck gives its blocks back", () => {
    const p = planLoad({ lines, otherShipments: [], prevLoaded: { B: 40 }, postedForShipment: { pB: -40 }, nextLoaded: {} });
    expect(p.stockMoves).toEqual([{ productId: "pB", change: 40 }]);
  });

  it("reports line ids that are not on the order", () => {
    const p = planLoad({ lines, otherShipments: [], prevLoaded: null, postedForShipment: {}, nextLoaded: { A: 1, ghost: 5 } });
    expect(p.unknownLineIds).toEqual(["ghost"]);
  });

  it("flags over-load only when this load adds to it", () => {
    const over = planLoad({ lines, otherShipments: [{ loadedLines: { A: 150 } }], prevLoaded: null, postedForShipment: {}, nextLoaded: { A: 100 } });
    expect(over.overload).toEqual([{ lineId: "A", extra: 50 }]);
    // re-saving a truck whose over-load was already confirmed does not ask again
    const same = planLoad({ lines, otherShipments: [], prevLoaded: { A: 250 }, postedForShipment: { pA: -250 }, nextLoaded: { A: 250 } });
    expect(same.overload).toEqual([]);
  });
});

describe("overloadRefusal — the confirm-first answer, same before and inside the transaction", () => {
  const priced = [
    { id: "A", productLabel: "600×300×200", unitPrice: 18000.5 },
    { id: "B", productLabel: "600×300×300", unitPrice: 20000 },
  ];

  it("is null when nothing goes over", () => {
    expect(overloadRefusal(priced, [])).toBeNull();
  });

  it("totals the extra blocks and money and labels each line", () => {
    const r = overloadRefusal(priced, [{ lineId: "A", extra: 50 }, { lineId: "B", extra: 2 }]);
    expect(r?.status).toBe(409);
    expect(r?.message).toMatch(/^Буюртмадан ортиқ: \+52 та · \+940\s025 UZS/);
    expect(r?.details).toEqual({
      code: "OVERLOAD_CONFIRM_REQUIRED",
      extraBlocks: 52,
      extraAmount: 940025,
      overload: [
        { lineId: "A", extra: 50, label: "600×300×200" },
        { lineId: "B", extra: 2, label: "600×300×300" },
      ],
    });
  });
});

