import { describe, expect, it } from "vitest";
import { decideHybrid } from "../grouping";
import { computeTaper } from "../compute-taper";

/**
 * §4.3 — Hybrid trigger fires when ANY of:
 *   • |C_r| > 0.50 m
 *   • rowsPractical < 4
 *   • every row would need a unique beam
 */
describe("§4.3 hybrid detection", () => {
  it("|C_r| > 0.50 → requiresHybrid true", () => {
    const d = decideHybrid({
      cr: 0.6,
      rowsPractical: 10,
      groupCountIfNotHybrid: 2,
    });
    expect(d.requiresHybrid).toBe(true);
  });

  it("rowsPractical < 4 → requiresHybrid true", () => {
    const d = decideHybrid({
      cr: 0.05,
      rowsPractical: 3,
      groupCountIfNotHybrid: 2,
    });
    expect(d.requiresHybrid).toBe(true);
  });

  it("both moderate → requiresHybrid false", () => {
    const d = decideHybrid({
      cr: 0.04,
      rowsPractical: 12,
      groupCountIfNotHybrid: 2,
    });
    expect(d.requiresHybrid).toBe(false);
  });

  it("third trigger: every row needs a unique beam → requiresHybrid true", () => {
    // groupCountIfNotHybrid >= rowsPractical and rows > 0
    const d = decideHybrid({
      cr: 0.04,
      rowsPractical: 3,
      groupCountIfNotHybrid: 3,
    });
    // (rowsPractical < 4 also triggers here, but the unique-beam
    // reason should be present too.)
    expect(d.requiresHybrid).toBe(true);
    expect(d.reasons.some((r) => r.toLowerCase().includes("unique beam"))).toBe(true);
  });

  it("end-to-end: example 3 inputs flip the order to hybrid", () => {
    const r = computeTaper({ width1: 5.0, width2: 2.0, length: 1.6 });
    expect(r.requiresHybrid).toBe(true);
    expect(r.groupingStrategy).toBe("hybrid");
  });
});
