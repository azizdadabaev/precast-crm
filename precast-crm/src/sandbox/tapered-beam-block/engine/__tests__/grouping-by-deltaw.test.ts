import { describe, expect, it } from "vitest";
import { tierFromDeltaW } from "../grouping";

/**
 * §4.1 — Tier from total taper |ΔW|.
 *
 * Boundary convention (declared once in grouping.ts header):
 * each upper-bound value belongs to the LOWER tier. So
 *   |ΔW| = 0.25 → tier 1
 *   |ΔW| = 0.50 → tier 2
 *   |ΔW| = 0.80 → tier 3
 *   |ΔW| > 0.80 → tier 4
 */
describe("§4.1 tier from |ΔW|", () => {
  it("|ΔW| at 0.25 m → tier 1", () => {
    expect(tierFromDeltaW(0.25)).toBe(1);
    expect(tierFromDeltaW(-0.25)).toBe(1);
  });

  it("|ΔW| at 0.26 m → tier 2", () => {
    expect(tierFromDeltaW(0.26)).toBe(2);
  });

  it("|ΔW| at 0.50 m → tier 2 (boundary inclusive on lower side)", () => {
    expect(tierFromDeltaW(0.5)).toBe(2);
  });

  it("|ΔW| at 0.51 m → tier 3", () => {
    expect(tierFromDeltaW(0.51)).toBe(3);
  });

  it("|ΔW| at 0.80 m → tier 3", () => {
    expect(tierFromDeltaW(0.8)).toBe(3);
  });

  it("|ΔW| at 0.81 m → tier 4 (hybrid escape is decided elsewhere)", () => {
    expect(tierFromDeltaW(0.81)).toBe(4);
  });

  it("very small |ΔW| → tier 1", () => {
    expect(tierFromDeltaW(0.05)).toBe(1);
    expect(tierFromDeltaW(0)).toBe(1);
  });
});
