import { describe, it, expect } from "vitest";
import { planLoad } from "@/lib/gazoblok-quantities";

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
