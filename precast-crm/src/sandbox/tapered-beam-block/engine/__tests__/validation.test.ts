import { describe, expect, it } from "vitest";
import { computeTaper } from "../compute-taper";
import { MAX_PRODUCIBLE_BEAM_M } from "../helpers";

/**
 * §8 — Validation rules. The engine never throws; all rules surface
 * as entries in the returned `errors[]` or `warnings[]` arrays.
 */
describe("§8 validation", () => {
  it("negative dimensions produce a clear error", () => {
    const r = computeTaper({ width1: -1, width2: 4, length: 5 });
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors.join(" ").toLowerCase()).toContain("width1");
  });

  it("zero dimensions produce errors", () => {
    const r = computeTaper({ width1: 0, width2: 4, length: 5 });
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it("beamSpacing ≤ 0 produces an error", () => {
    const r = computeTaper({ width1: 3, width2: 4, length: 5, beamSpacing: 0 });
    expect(r.errors.join(" ").toLowerCase()).toContain("beamspacing");
  });

  it("width exceeding [VERIFY] max producible beam length produces an error", () => {
    const r = computeTaper({
      width1: 3,
      width2: MAX_PRODUCIBLE_BEAM_M + 1,
      length: 5,
    });
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors.join(" ").toLowerCase()).toMatch(
      /producible|span|verify/,
    );
  });

  it("|C_r| > 0.50 surfaces an extreme-taper warning", () => {
    // ΔW=1.5 over length=1.5 → C_m=1, C_r=0.58.
    const r = computeTaper({ width1: 2, width2: 3.5, length: 1.5 });
    const joined = r.warnings.join(" ").toLowerCase();
    expect(joined).toContain("extreme");
  });

  it("rowsPractical < 3 surfaces a 'geometry too short' warning", () => {
    // length 1.0 m with spacing 0.58 → ceil(1.724) = 2 rows.
    const r = computeTaper({ width1: 3, width2: 3.4, length: 1.0 });
    const joined = r.warnings.join(" ").toLowerCase();
    expect(joined).toContain("short");
  });

  it("non-finite inputs are rejected as errors, not exceptions", () => {
    const r1 = computeTaper({ width1: Number.NaN, width2: 4, length: 5 });
    const r2 = computeTaper({
      width1: 3,
      width2: 4,
      length: Number.POSITIVE_INFINITY,
    });
    expect(r1.errors.length).toBeGreaterThan(0);
    expect(r2.errors.length).toBeGreaterThan(0);
  });

  it("beamSpacing different from 0.58 produces a non-blocking warning", () => {
    const r = computeTaper({ width1: 3, width2: 3.6, length: 6, beamSpacing: 0.6 });
    expect(r.errors).toEqual([]); // not an error
    const joined = r.warnings.join(" ").toLowerCase();
    expect(joined).toContain("0.58");
  });

  it("validation never throws — all reject cases return structured errors", () => {
    expect(() =>
      computeTaper({
        width1: -1,
        width2: -2,
        length: -3,
        beamSpacing: -1,
      }),
    ).not.toThrow();
  });
});
