import { describe, expect, it } from "vitest";
import { severityFromCr, tierFromSeverity } from "../grouping";

/**
 * §4.2 — Severity from per-row change |C_r|.
 *
 *   < 0.03 m → "small" → tier 1 (single stock beam)
 *   0.03 – 0.12 m → "medium" → tier 2 (grouped strategy)
 *   ≥ 0.12 m → "extreme" → tier "hybrid" (wedge geometry)
 *
 * The boundary at 0.03 and 0.12 is inclusive on the upper side per
 * the spec table reading.
 */
describe("§4.2 severity from |C_r|", () => {
  it("|C_r| at 0.029 m → severity 'small', tier 1", () => {
    expect(severityFromCr(0.029)).toBe("small");
    expect(tierFromSeverity(severityFromCr(0.029))).toBe(1);
  });

  it("|C_r| at 0.03 m → severity 'medium'", () => {
    expect(severityFromCr(0.03)).toBe("medium");
  });

  it("|C_r| at 0.119 m → severity 'medium'", () => {
    expect(severityFromCr(0.119)).toBe("medium");
  });

  it("|C_r| at 0.12 m → severity 'extreme', tier 'hybrid' recommended", () => {
    expect(severityFromCr(0.12)).toBe("extreme");
    expect(tierFromSeverity(severityFromCr(0.12))).toBe("hybrid");
  });

  it("severity is sign-insensitive (narrowing tapers are also classified)", () => {
    expect(severityFromCr(-0.029)).toBe("small");
    expect(severityFromCr(-0.05)).toBe("medium");
    expect(severityFromCr(-0.5)).toBe("extreme");
  });
});
