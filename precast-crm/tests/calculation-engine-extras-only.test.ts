import { describe, it, expect } from "vitest";
import {
  BEAM_WIDTH,
  CalculationError,
  EXTRA_BEAM_PRICE_TIERS,
  TOPPING_THICKNESS,
  calculateSlab,
  tierPrice,
} from "../src/services/calculation-engine";

// ── Extras-only mode ──────────────────────────────────────────────
//
// Operator wants N reinforcing/edge beams as their own line item
// without a full slab — width and extras given, length=0.
//
// All tests in this file exercise the case validate() now allows:
// inner_length = 0 AND extra_beams >= 1.

describe("extras-only mode (length=0 + extras>=1)", () => {
  it("computes a row for width=5.05, length=0, extras=2", () => {
    const r = calculateSlab({ inner_width: 5.05, inner_length: 0, extra_beams: 2 });
    expect(r.is_extras_only).toBe(true);
    expect(r.beam_length).toBe(5.35); // 5.05 + 0.30 (default bearing 0.15 each side)
    expect(r.beam_count).toBe(2);
    expect(r.monolith_length).toBe(0.24); // 2 × 0.12
    // monolith_area = inner_width × slab_length (NOT beam_length × slab_length —
    // the extras footprint is the actual room width, not the beam-end-to-end span)
    expect(r.monolith_area).toBe(5.05 * 0.24);

    const expectedRate = tierPrice(5.35, EXTRA_BEAM_PRICE_TIERS);
    const expectedSubtotal = Math.round(2 * 5.35 * expectedRate * 100) / 100;
    expect(r.subtotal).toBe(expectedSubtotal);
    expect(r.manual_extra_beams_cost).toBe(expectedSubtotal);

    // Sentinel zeros — UI renders these as em-dashes.
    expect(r.pitches).toBe(0);
    expect(r.blocks_per_row).toBe(0);
    expect(r.block_rows).toBe(0);
    expect(r.total_blocks).toBe(0);
    expect(r.m2_price).toBe(0);
    expect(r.m2_cost).toBe(0);
    expect(r.billed_length).toBe(0);
    expect(r.billed_area).toBe(0);
  });

  it("computes a row for width=4.0, length=0, extras=3", () => {
    const r = calculateSlab({ inner_width: 4.0, inner_length: 0, extra_beams: 3 });
    expect(r.is_extras_only).toBe(true);
    expect(r.beam_length).toBe(4.3);
    expect(r.beam_count).toBe(3);
    expect(r.monolith_length).toBe(0.36); // 3 × 0.12
    expect(r.extra_beam_price_per_m).toBe(60_000); // tier 1 (max 4.30)
  });

  it("computes concrete_volume over the actual extras footprint", () => {
    const r = calculateSlab({ inner_width: 5.05, inner_length: 0, extra_beams: 2 });
    const expected = 5.05 * (2 * BEAM_WIDTH) * TOPPING_THICKNESS;
    expect(r.concrete_volume).toBe(Math.round(expected * 1000) / 1000);
  });

  it("respects a non-default bearing", () => {
    const r = calculateSlab({
      inner_width: 5.0,
      inner_length: 0,
      extra_beams: 1,
      bearing: 0.2,
    });
    expect(r.is_extras_only).toBe(true);
    expect(r.beam_length).toBe(5.4); // 5.0 + 0.40
  });

  it("returns sentinel pattern values that UI can ignore", () => {
    const r = calculateSlab({ inner_width: 5, inner_length: 0, extra_beams: 1 });
    // The pattern fields are populated with sentinel "GB" so the type
    // is satisfied but UI keys off is_extras_only first.
    expect(r.pattern).toBe("GB");
    expect(r.pattern_auto).toBe("GB");
  });
});

describe("extras-only mode — validation gates", () => {
  it("rejects width=0 even with extras>0", () => {
    expect(() =>
      calculateSlab({ inner_width: 0, inner_length: 0, extra_beams: 2 }),
    ).toThrow(CalculationError);
  });

  it("still rejects length=0 with NO extras", () => {
    // Same case the existing test in calculation-engine.test.ts covers.
    // Keeping a duplicate here so this file is self-contained for the
    // extras-only matrix.
    expect(() =>
      calculateSlab({ inner_width: 5, inner_length: 0 }),
    ).toThrow(CalculationError);
  });

  it("still rejects length=0 with extras=0", () => {
    expect(() =>
      calculateSlab({ inner_width: 5, inner_length: 0, extra_beams: 0 }),
    ).toThrow(CalculationError);
  });

  it("still rejects negative length even with extras", () => {
    expect(() =>
      calculateSlab({ inner_width: 5, inner_length: -1, extra_beams: 2 }),
    ).toThrow(CalculationError);
  });

  it("still rejects NaN length even with extras", () => {
    expect(() =>
      calculateSlab({ inner_width: 5, inner_length: NaN, extra_beams: 2 }),
    ).toThrow(CalculationError);
  });
});

describe("extras-only mode — does not regress length>0 paths", () => {
  it("length>0 + extras=0 returns is_extras_only=false", () => {
    const r = calculateSlab({ inner_width: 5.05, inner_length: 6, extra_beams: 0 });
    expect(r.is_extras_only).toBe(false);
  });

  it("length>0 + extras>0 returns is_extras_only=false (extras add on top)", () => {
    const r = calculateSlab({ inner_width: 5.05, inner_length: 6, extra_beams: 2 });
    expect(r.is_extras_only).toBe(false);
    // Extras add to beam_count on top of the pattern's base count.
    expect(r.beam_count).toBeGreaterThanOrEqual(2);
  });
});
