import { describe, expect, it } from "vitest";
import { ROUTING_MESSAGE_RECTANGULAR, computeTaper } from "../compute-taper";

describe("§0 routing guard", () => {
  it("rectangular input (width1 === width2, no irregular sides) sets isRectangular and refuses to compute", () => {
    const r = computeTaper({ width1: 4, width2: 4, length: 6 });

    expect(r.isRectangular).toBe(true);
    expect(r.errors).toContain(ROUTING_MESSAGE_RECTANGULAR);
    // No further computation: the report fields are stubbed.
    expect(r.perRowInnerWidths).toEqual([]);
    expect(r.groups).toEqual([]);
    expect(r.groupCount).toBe(0);
    expect(r.requiresHybrid).toBe(false);
  });

  it("irregular quad with length1 === length2 behaves identically to length=L with no irregular sides", () => {
    const withIrregular = computeTaper({
      width1: 3.6,
      width2: 4.2,
      length: 5,
      length1: 5,
      length2: 5,
    });
    const plain = computeTaper({ width1: 3.6, width2: 4.2, length: 5 });

    expect(withIrregular.errors).toEqual([]);
    expect(plain.errors).toEqual([]);
    expect(withIrregular.effectiveLength).toBe(plain.effectiveLength);
    expect(withIrregular.rowsPractical).toBe(plain.rowsPractical);
    expect(withIrregular.deltaW).toBe(plain.deltaW);
    expect(withIrregular.changePerRow).toBeCloseTo(plain.changePerRow, 9);
    expect(withIrregular.groupingStrategy).toBe(plain.groupingStrategy);
  });
});
