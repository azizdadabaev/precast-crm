import { describe, it, expect } from "vitest";
import { computeOvership } from "./gazoblok-overship";

const lines = [
  { id: "a", quantity: 100, unitPrice: 45_000 },
  { id: "b", quantity: 50, unitPrice: 30_000 },
];

describe("computeOvership", () => {
  it("no over-ship → 0 (exactly ordered)", () => {
    const r = computeOvership(lines, [{ loadedLines: { a: 100, b: 50 } }]);
    expect(r.overshipAmount).toBe(0);
    expect(r.perLine.get("a")).toBe(0);
    expect(r.perLine.get("b")).toBe(0);
  });

  it("under-ship still → 0", () => {
    const r = computeOvership(lines, [{ loadedLines: { a: 80 } }]);
    expect(r.overshipAmount).toBe(0);
    expect(r.perLine.get("a")).toBe(0);
  });

  it("single line over → over × unitPrice", () => {
    const r = computeOvership(lines, [{ loadedLines: { a: 130, b: 50 } }]);
    expect(r.perLine.get("a")).toBe(30);
    expect(r.overshipAmount).toBe(30 * 45_000);
  });

  it("over-count sums across shipments", () => {
    const r = computeOvership(lines, [
      { loadedLines: { a: 100 } },
      { loadedLines: { a: 30 } }, // 130 total → 30 over
    ]);
    expect(r.perLine.get("a")).toBe(30);
    expect(r.overshipAmount).toBe(30 * 45_000);
  });

  it("multi-line mixed (some under, some over) → only positives counted", () => {
    const r = computeOvership(lines, [{ loadedLines: { a: 90, b: 70 } }]);
    // a under (90 < 100) contributes 0; b over by 20.
    expect(r.perLine.get("a")).toBe(0);
    expect(r.perLine.get("b")).toBe(20);
    expect(r.overshipAmount).toBe(20 * 30_000);
  });

  it("a shipment carrying a line not over-ordered contributes 0", () => {
    // Line 'a' is loaded exactly; 'b' loaded under. Nothing over.
    const r = computeOvership(lines, [{ loadedLines: { a: 100, b: 10 } }]);
    expect(r.overshipAmount).toBe(0);
  });

  it("a loaded line not on the order is ignored (contributes 0)", () => {
    const r = computeOvership(lines, [{ loadedLines: { a: 100, ghost: 999 } }]);
    expect(r.overshipAmount).toBe(0);
    expect(r.perLine.has("ghost")).toBe(false);
  });

  it("null loadedLines is treated as empty", () => {
    const r = computeOvership(lines, [{ loadedLines: null }]);
    expect(r.overshipAmount).toBe(0);
  });
});
