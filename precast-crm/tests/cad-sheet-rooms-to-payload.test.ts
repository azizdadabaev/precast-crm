import { describe, it, expect } from "vitest";
import { slabRowsToSheetPayload } from "@/lib/cad/sheet/rooms-to-payload";
import type { SlabRow } from "@/components/calculation/MultiRoomCalculator";

function makeRow(over: Partial<SlabRow>): SlabRow {
  return {
    id: "r",
    name: "",
    innerWidth: 0,
    innerLength: 0,
    bearing: 0.15,
    correction: 0,
    extraBeams: 0,
    forceStartBeam: false,
    patternOverride: "AUTO",
    result: null,
    originalWidth: null,
    m2PriceOverride: false,
    m2PriceOverrideValue: null,
    m2PriceReason: null,
    ...over,
  };
}

describe("slabRowsToSheetPayload", () => {
  it("maps inner dims and name", () => {
    const out = slabRowsToSheetPayload([
      makeRow({ name: "Зал", innerWidth: 4.2, innerLength: 6 }),
      makeRow({ name: "", innerWidth: 3, innerLength: 5 }),
    ]);
    expect(out).toEqual([
      { name: "Зал", inner_width: 4.2, inner_length: 6 },
      { inner_width: 3, inner_length: 5 },
    ]);
  });

  it("drops rows with non-positive dims", () => {
    const out = slabRowsToSheetPayload([
      makeRow({ name: "ok", innerWidth: 4, innerLength: 6 }),
      makeRow({ name: "zero-w", innerWidth: 0, innerLength: 6 }),
      makeRow({ name: "neg-l", innerWidth: 4, innerLength: -2 }),
    ]);
    expect(out).toEqual([{ name: "ok", inner_width: 4, inner_length: 6 }]);
  });
});
