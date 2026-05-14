import { describe, it, expect } from "vitest";
import {
  calculateSlab,
  DEFAULT_PRICE_CONFIG,
  M2_PRICE_TIERS,
  EXTRA_BEAM_PRICE_TIERS,
  type PriceConfig,
} from "../src/services/calculation-engine";

// These tests exercise the priceConfig threading without touching the
// database. The pricing-config module's load/save go through Prisma and
// belong in an integration test runner; here we only verify the engine
// reads the config when given one.

describe("calculateSlab — priceConfig override", () => {
  it("falls back to DEFAULT_PRICE_CONFIG when no config is passed (backward compat)", () => {
    // The 4 × 6 auto BGB reference case from the existing pricing suite
    // — running it without a config should still produce the original
    // 140k tier so existing call sites and tests keep passing.
    const r = calculateSlab({ inner_width: 4, inner_length: 6 });
    expect(r.m2_price).toBe(140_000);
    expect(r.extra_beam_price_per_m).toBe(60_000);
  });

  it("uses the supplied tier prices instead of the engine constants", () => {
    // Owner doubles every m² tier and zeros extra-beam tier 1.
    const custom: PriceConfig = {
      m2_price_tiers: DEFAULT_PRICE_CONFIG.m2_price_tiers.map((t) => ({
        max_beam_length: t.max_beam_length,
        price: t.price * 2,
      })),
      extra_beam_price_tiers: DEFAULT_PRICE_CONFIG.extra_beam_price_tiers.map(
        (t, i) => ({
          max_beam_length: t.max_beam_length,
          price: i === 0 ? 0 : t.price,
        }),
      ),
      block_unit_price: DEFAULT_PRICE_CONFIG.block_unit_price,
    };

    const r = calculateSlab(
      { inner_width: 4, inner_length: 6 }, // auto BGB
      custom,
    );
    // beam_length 4.30 → first bracket → doubled m² = 280k, zeroed
    // extra-beam tier.
    expect(r.m2_price).toBe(280_000);
    expect(r.extra_beam_price_per_m).toBe(0);
    // BGB pattern_extra_cost was beam_length × extra_beam_price; with
    // the per-meter tier zeroed, the closing beam now costs 0.
    expect(r.pattern_extra_cost).toBe(0);
  });

  it("custom tier still respects the bracket boundaries", () => {
    // A 5.20 m beam_length should map to the second bracket (≤ 5.30),
    // not the first. Override only the second tier's price; confirm it
    // is what the engine returns.
    const custom: PriceConfig = {
      m2_price_tiers: M2_PRICE_TIERS.map((t, i) => ({
        max_beam_length: t.max_beam_length,
        price: i === 1 ? 999_999 : t.price,
      })),
      extra_beam_price_tiers: EXTRA_BEAM_PRICE_TIERS,
      block_unit_price: 0,
    };
    const r = calculateSlab(
      { inner_width: 4.9, inner_length: 6 }, // beam_length 5.20
      custom,
    );
    expect(r.beam_length).toBeCloseTo(5.20, 3);
    expect(r.m2_price).toBe(999_999);
  });

  it("extras-only mode honors the custom extra-beam tier", () => {
    const custom: PriceConfig = {
      m2_price_tiers: M2_PRICE_TIERS,
      extra_beam_price_tiers: EXTRA_BEAM_PRICE_TIERS.map((t) => ({
        max_beam_length: t.max_beam_length,
        price: 1, // 1 UZS/m — easy to verify
      })),
      block_unit_price: 0,
    };
    const r = calculateSlab(
      { inner_width: 4, inner_length: 0, extra_beams: 2 },
      custom,
    );
    // 2 extras × beam_length 4.30 × 1 UZS/m = 8.60
    expect(r.is_extras_only).toBe(true);
    expect(r.extra_beam_price_per_m).toBe(1);
    expect(r.subtotal).toBeCloseTo(2 * 4.30 * 1, 2);
  });
});
