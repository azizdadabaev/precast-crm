import { describe, it, expect } from "vitest";
import {
  calculateSlab,
  projectTotal,
  autoPickPattern,
  tierPrice,
  M2_PRICE_TIERS,
  EXTRA_BEAM_PRICE_TIERS,
  BLOCK_UNIT_PRICE,
  PITCH,
  CalculationError,
} from "../src/services/calculation-engine";

// ── Helpers / sanity ────────────────────────────────────────────

describe("autoPickPattern (post-correction remainder R)", () => {
  it("R = 0  → GB at N", () => {
    expect(autoPickPattern(0)).toEqual({ pattern: "GB", bumpPitches: false });
  });
  it("R ≤ 0.20 → BGB", () => {
    expect(autoPickPattern(0.05)).toEqual({ pattern: "BGB", bumpPitches: false });
    expect(autoPickPattern(0.20)).toEqual({ pattern: "BGB", bumpPitches: false });
  });
  it("0.20 < R ≤ 0.45 → GBG", () => {
    expect(autoPickPattern(0.21)).toEqual({ pattern: "GBG", bumpPitches: false });
    expect(autoPickPattern(0.45)).toEqual({ pattern: "GBG", bumpPitches: false });
  });
  it("R > 0.45 → GB at N+1 (round up)", () => {
    expect(autoPickPattern(0.46)).toEqual({ pattern: "GB", bumpPitches: true });
    expect(autoPickPattern(0.57)).toEqual({ pattern: "GB", bumpPitches: true });
  });
});

describe("tierPrice", () => {
  it("returns 140k for 4.30 m beam (m² rate)", () => {
    expect(tierPrice(4.30, M2_PRICE_TIERS)).toBe(140_000);
  });
  it("returns 80k for 6.30 m beam (extra-beam per-m rate)", () => {
    expect(tierPrice(6.30, EXTRA_BEAM_PRICE_TIERS)).toBe(80_000);
  });
  it("clamps above the largest tier to that tier's price", () => {
    expect(tierPrice(9.00, M2_PRICE_TIERS)).toBe(230_000);
  });
});

// ── Auto-picked pattern reference cases (user-provided) ─────────

describe("calculateSlab — auto-picked patterns from real examples", () => {
  it("4 × 6, no correction → BGB at 10 pitches (R = 0.20 m exactly)", () => {
    // 6 / 0.58 = 10.34 → N=10, R=0.20 → auto BGB
    const r = calculateSlab({ inner_width: 4, inner_length: 6 });
    expect(r.pitches).toBe(10);
    expect(r.remainder).toBeCloseTo(0.20, 3);
    expect(r.pattern).toBe("BGB");
    expect(r.beam_length).toBe(4.30);
    expect(r.beam_count).toBe(11);          // pitches + 1
    expect(r.block_rows).toBe(10);
    expect(r.blocks_per_row).toBe(20);      // CEIL(4 / 0.20)
    expect(r.total_blocks).toBe(200);       // 20 × 10
    expect(r.billed_length).toBeCloseTo(5.80, 3);
    expect(r.monolith_length).toBeCloseTo(5.92, 3); // 5.80 + 0.12
    expect(r.billed_area).toBeCloseTo(24.94, 2);    // 4.30 × 5.80
  });

  it("4 × 6 with correction +0.30 → GB at 11 pitches (extra pair)", () => {
    // effective 6.30 / 0.58 = 10.86 → N=10, R=0.50 → auto GB at N+1=11
    const r = calculateSlab({ inner_width: 4, inner_length: 6, correction: 0.30 });
    expect(r.pitches).toBe(11);
    expect(r.pattern).toBe("GB");
    expect(r.beam_count).toBe(11);
    expect(r.block_rows).toBe(11);
    expect(r.total_blocks).toBe(220);
    expect(r.billed_length).toBeCloseTo(6.38, 3);
    expect(r.monolith_length).toBeCloseTo(6.38, 3);
    expect(r.billed_area).toBeCloseTo(27.434, 3);
  });

  it("4 × 4.3 → GBG at 7 pitches (R = 0.24 → extra block row)", () => {
    // 4.3 / 0.58 = 7.41 → N=7, R=0.24 → auto GBG.
    // GBG billing rule: the closing block row is m²-billed, so
    // billed_length == monolith_length == 7×PITCH + BLOCK_VISIBLE.
    const r = calculateSlab({ inner_width: 4, inner_length: 4.3 });
    expect(r.pitches).toBe(7);
    expect(r.pattern).toBe("GBG");
    expect(r.beam_count).toBe(7);            // GBG: no extra beam
    expect(r.block_rows).toBe(8);            // pitches + 1
    expect(r.total_blocks).toBe(160);        // 20 × 8
    expect(r.billed_length).toBeCloseTo(4.51, 3); // 7×0.58 + 0.45
    expect(r.monolith_length).toBeCloseTo(4.51, 3);
  });

  it("4 × 3.5 → BGB at 6 pitches (R ≈ 0.02 → extra beam)", () => {
    // 3.5 / 0.58 = 6.03 → N=6, R≈0.02 → auto BGB
    const r = calculateSlab({ inner_width: 4, inner_length: 3.5 });
    expect(r.pitches).toBe(6);
    expect(r.pattern).toBe("BGB");
    expect(r.beam_count).toBe(7);
    expect(r.block_rows).toBe(6);
    expect(r.total_blocks).toBe(120);        // 20 × 6
    expect(r.billed_length).toBeCloseTo(3.48, 3);
    expect(r.monolith_length).toBeCloseTo(3.60, 3); // 3.48 + 0.12
  });
});

// ── GBG billing-rule cases — closing block row m²-billed ─────────
//
// New rule (per construction-pricing convention): the Г-Б-Г pattern's
// closing block row is physically part of the slab the customer is
// buying, so the m² tier rate must cover it. billed_length expands by
// BLOCK_VISIBLE (0.45 m) and pattern_extra_cost is 0 for GBG.
// BGB's closing beam is unaffected — still billed at the per-meter
// extra-beam tier.

describe("calculateSlab — GBG closing block row is m²-billed (not per-block)", () => {
  it("user's 4.5 × 6 explicit GBG: billed_area 30 m² × 160k tier = 4,800,000", () => {
    // 4.5 × 6, bearing 0.15, pattern GBG explicit.
    // beam_length = 4.5 + 2×0.15 = 4.80 m  → 160k tier (≤ 5.30)
    // pitches     = floor(6 / 0.58) = 10
    // blocks_per_row = ceil(4.5 / 0.20) = 23
    // block_rows  = 10 + 1 = 11
    // total_blocks = 11 × 23 = 253
    // beams        = 10
    // billed_length = 10×0.58 + 0.45 = 6.25 m
    // billed_area   = 4.80 × 6.25 = 30.000 m²
    // m2_cost       = 30 × 160,000 = 4,800,000
    // pattern_extra_cost = 0  (was 23 × 6,000 = 138,000 before the change)
    // subtotal      = 4,800,000
    const r = calculateSlab({
      inner_width: 4.5,
      inner_length: 6,
      bearing: 0.15,
      pattern: "GBG",
    });
    expect(r.pattern).toBe("GBG");
    expect(r.pitches).toBe(10);
    expect(r.blocks_per_row).toBe(23);
    expect(r.block_rows).toBe(11);
    expect(r.total_blocks).toBe(253);
    expect(r.beam_count).toBe(10);
    expect(r.beam_length).toBeCloseTo(4.80, 3);
    expect(r.billed_length).toBeCloseTo(6.25, 3);
    expect(r.billed_area).toBeCloseTo(30.0, 3);
    expect(r.m2_price).toBe(160_000);
    expect(r.m2_cost).toBe(4_800_000);
    expect(r.pattern_extra_cost).toBe(0);
    expect(r.manual_extra_beams_cost).toBe(0);
    expect(r.subtotal).toBe(4_800_000);
  });

  it("auto-picked GBG (4 × 3.20 → R=0.30): closing row folded into m²", () => {
    // 4 × 3.20, bearing 0.15. effective_length = 3.20.
    // pitches=5 (5×0.58=2.90), R=0.30 → auto GBG.
    // beam_length=4.30 → 140k tier.
    // billed_length = 2.90 + 0.45 = 3.35 m
    // billed_area   = 4.30 × 3.35 = 14.405 m²
    // m2_cost       = 14.405 × 140k = 2,016,700
    // pattern_extra_cost = 0
    const r = calculateSlab({ inner_width: 4, inner_length: 3.20 });
    expect(r.pattern).toBe("GBG");
    expect(r.pitches).toBe(5);
    expect(r.block_rows).toBe(6);
    expect(r.beam_count).toBe(5);
    expect(r.billed_length).toBeCloseTo(3.35, 3);
    expect(r.billed_area).toBeCloseTo(14.405, 3);
    expect(r.m2_cost).toBe(2_016_700);
    expect(r.pattern_extra_cost).toBe(0);
    expect(r.subtotal).toBe(2_016_700);
  });

  it("billed_length == monolith_length for plain GBG (no manual extras)", () => {
    // When there are no manual extras, the billed slab and the visible
    // slab are exactly the same — the closing block row counts the
    // same way for both purposes.
    const r = calculateSlab({ inner_width: 4, inner_length: 6, pattern: "GBG" });
    expect(r.pattern).toBe("GBG");
    expect(r.billed_length).toBeCloseTo(r.monolith_length, 3);
  });

  it("BGB pricing unchanged — closing beam still bills at extra-beam tier", () => {
    // Regression guard: only GBG changed. BGB stays as-is so existing
    // BGB orders keep their pricing.
    const r = calculateSlab({ inner_width: 4, inner_length: 6 }); // auto BGB at R=0.20
    expect(r.pattern).toBe("BGB");
    expect(r.billed_length).toBeCloseTo(5.80, 3);                 // NOT 5.92
    expect(r.billed_area).toBeCloseTo(24.94, 2);
    expect(r.pattern_extra_cost).toBe(4.30 * 60_000);             // 258,000
  });

  it("GBG with manual extras: closing row m²-billed, conversion still applies", () => {
    // 4 × 4.3 auto GBG + 2 manual extras: the first extra triggers the
    // GBG→GB-at-pitches+1 conversion (cancelling the GBG extension),
    // the second extra remains as a per-meter line item. The result
    // is pure GB pricing — no GBG bonus, no per-block charge.
    const r = calculateSlab({
      inner_width: 4,
      inner_length: 4.3,
      extra_beams: 2,
    });
    expect(r.pattern).toBe("GB");                  // converted from GBG
    expect(r.pitches).toBe(8);
    expect(r.billed_length).toBeCloseTo(8 * 0.58, 3); // GB → no extension
    expect(r.pattern_extra_cost).toBe(0);
    expect(r.manual_extra_beams_cost).toBe(1 * 4.30 * 60_000); // 258,000
  });
});

// ── Pricing reference cases (user's text examples for 4 × 6) ───

describe("calculateSlab — pricing matches user's reference examples", () => {
  it("4 × 6 BGB option: m² at 4.30×5.80 + 1 extra beam at 4.30×60k", () => {
    const r = calculateSlab({ inner_width: 4, inner_length: 6 }); // auto BGB
    expect(r.m2_price).toBe(140_000);
    expect(r.extra_beam_price_per_m).toBe(60_000);
    expect(r.m2_cost).toBe(24.94 * 140_000);                       // 3,491,600
    expect(r.pattern_extra_cost).toBe(4.30 * 60_000);               // 258,000
    expect(r.manual_extra_beams_cost).toBe(0);
    expect(r.subtotal).toBe(24.94 * 140_000 + 4.30 * 60_000);       // 3,749,600
  });

  it("4 × 6 GBG option: m² billed on slab including closing block row (4.30 × 6.25)", () => {
    // billed_length = 10×PITCH + BLOCK_VISIBLE = 5.80 + 0.45 = 6.25
    // billed_area   = 4.30 × 6.25 = 26.875
    // m2_cost       = 26.875 × 140,000 = 3,762,500
    // pattern_extra_cost = 0 (no more separate per-block charge for GBG)
    const r = calculateSlab({ inner_width: 4, inner_length: 6, pattern: "GBG" });
    expect(r.pattern).toBe("GBG");
    expect(r.billed_length).toBeCloseTo(6.25, 3);
    expect(r.billed_area).toBeCloseTo(26.875, 3);
    expect(r.m2_cost).toBe(26.875 * 140_000);
    expect(r.pattern_extra_cost).toBe(0);
    expect(r.subtotal).toBe(26.875 * 140_000);
  });

  it("4 × 6 extra-pair option (correction +0.30): m² at 4.30×6.38, no extras", () => {
    const r = calculateSlab({ inner_width: 4, inner_length: 6, correction: 0.30 });
    expect(r.pattern).toBe("GB");
    expect(r.m2_cost).toBeCloseTo(27.434 * 140_000, 0);
    expect(r.pattern_extra_cost).toBe(0);
    expect(r.manual_extra_beams_cost).toBe(0);
    expect(r.subtotal).toBeCloseTo(27.434 * 140_000, 0);
  });

  // ── New GBG billing rule (closing block row folded into m²-billed area) ─────
  // Reported by the user on 2026-05-14: the visual closing block row of
  // a Г-Б-Г slab is physically part of what's poured for the customer,
  // so it should be charged at the m² tier — NOT split out as a
  // per-block line item the way it used to be. BGB's extra closing
  // beam continues to bill at the per-meter extra-beam tier (unchanged).
  describe("GBG billing rule · closing block row m²-billed via expanded billed_length", () => {
    it("4.5 × 6 explicit GBG → 6.25 m billed length, 30 m² billed area, 4,800,000 so'm", () => {
      // User's exact reproduction case from the screenshot:
      //   pitches = floor(6 / 0.58) = 10
      //   billed_length = 10×0.58 + 0.45 = 6.25 m
      //   beam_length = 4.5 + 2×0.15 = 4.80 m → m² tier price 160,000
      //   billed_area = 4.80 × 6.25 = 30.000 m²
      //   subtotal = 30 × 160,000 = 4,800,000 so'm
      const r = calculateSlab({ inner_width: 4.5, inner_length: 6, pattern: "GBG" });
      expect(r.pattern).toBe("GBG");
      expect(r.pitches).toBe(10);
      expect(r.beam_count).toBe(10);            // GBG: no extra beam
      expect(r.block_rows).toBe(11);            // pitches + 1
      expect(r.total_blocks).toBe(23 * 11);     // 23 blocks/row × 11 rows = 253
      expect(r.beam_length).toBeCloseTo(4.80, 3);
      expect(r.m2_price).toBe(160_000);
      expect(r.billed_length).toBeCloseTo(6.25, 3);
      expect(r.billed_area).toBeCloseTo(30.0, 3);
      expect(r.m2_cost).toBe(4_800_000);
      expect(r.pattern_extra_cost).toBe(0);
      expect(r.manual_extra_beams_cost).toBe(0);
      expect(r.subtotal).toBe(4_800_000);
    });

    it("Auto-picked GBG (4 × 3.20) at 5 pitches: billed includes the extra block row", () => {
      // 3.20 / 0.58 = 5.51 → N=5, R=0.30 → auto GBG
      // billed_length = 5×0.58 + 0.45 = 3.35 m
      // beam_length   = 4 + 0.30 = 4.30 → m² tier 140,000
      // billed_area   = 4.30 × 3.35 = 14.405 m²
      // subtotal      = 14.405 × 140,000 = 2,016,700 so'm
      const r = calculateSlab({ inner_width: 4, inner_length: 3.20 });
      expect(r.pattern).toBe("GBG");
      expect(r.pitches).toBe(5);
      expect(r.beam_count).toBe(5);
      expect(r.block_rows).toBe(6);
      expect(r.total_blocks).toBe(20 * 6);
      expect(r.billed_length).toBeCloseTo(3.35, 3);
      expect(r.billed_area).toBeCloseTo(14.405, 3);
      expect(r.m2_cost).toBeCloseTo(14.405 * 140_000, 0);
      expect(r.pattern_extra_cost).toBe(0);
      expect(r.subtotal).toBeCloseTo(14.405 * 140_000, 0);
    });

    it("GBG and monolith report identical lengths (no separate per-block line)", () => {
      // monolith_length == billed_length when there are no manual extras,
      // because the only extension is BLOCK_VISIBLE which now lives in
      // BOTH lengths.
      const r = calculateSlab({ inner_width: 4, inner_length: 4.3 });
      expect(r.pattern).toBe("GBG");
      expect(r.billed_length).toBeCloseTo(r.monolith_length, 3);
      expect(r.pattern_extra_cost).toBe(0);
    });

    it("BGB closing beam still bills at the extra-beam tier (unchanged)", () => {
      // Regression: this rule applies to GBG only. BGB's pattern_extra_cost
      // is still `beam_length × extra_beam_tier`.
      const r = calculateSlab({ inner_width: 4, inner_length: 3.5 });
      expect(r.pattern).toBe("BGB");
      expect(r.billed_length).toBeCloseTo(6 * 0.58, 3); // 3.48 — no extension
      expect(r.pattern_extra_cost).toBe(4.30 * 60_000);
    });

    it("Manual extra-beam absorbing the GBG closing block (conversion to GB) zeroes pattern_extra_cost", () => {
      // Regression: the GBG→GB conversion path used to set
      // pattern_extra_cost=0 because GB has no pattern extras. Same
      // outcome under the new rule, just for a different reason —
      // the resulting pattern is GB, so the GBG-only extension is moot.
      const r = calculateSlab({ inner_width: 4, inner_length: 4.3, pattern: "GBG", extra_beams: 1 });
      expect(r.pattern).toBe("GB");
      expect(r.billed_length).toBeCloseTo(8 * 0.58, 3); // 4.64, no GBG extension
      expect(r.pattern_extra_cost).toBe(0);
    });
  });

  it("manual extra_beams charged on full beam_length (incl. bearings)", () => {
    // 4 × 6 with 4 extra beams; pattern auto BGB
    const r = calculateSlab({ inner_width: 4, inner_length: 6, extra_beams: 4 });
    expect(r.beam_count).toBe(11 + 4); // BGB pitches+1 plus 4 manual
    expect(r.manual_extra_beams_cost).toBe(4 * 4.30 * 60_000);     // 1,032,000
  });
});

// ── Geometry rules independent of pattern ──────────────────────

describe("calculateSlab — geometry rules", () => {
  it("blocks_per_row = CEIL(inner_width / 0.20) for 4.10 m → 21", () => {
    const r = calculateSlab({ inner_width: 4.10, inner_length: 6 });
    expect(r.blocks_per_row).toBe(21);
  });

  it("blocks_per_row for 3.50 m → 18 (covers 3.60 m, accepted over-coverage)", () => {
    const r = calculateSlab({ inner_width: 3.50, inner_length: 6 });
    expect(r.blocks_per_row).toBe(18);
  });

  it("beam_length = inner_width + 2×bearing; default bearing 0.15", () => {
    expect(calculateSlab({ inner_width: 4, inner_length: 6 }).beam_length).toBe(4.30);
  });

  it("beam_length respects bearing override (e.g., 0.20 m each side)", () => {
    const r = calculateSlab({ inner_width: 4, inner_length: 6, bearing: 0.20 });
    expect(r.beam_length).toBe(4.40);
  });

  it("bearing 0 produces beam_length == inner_width", () => {
    const r = calculateSlab({ inner_width: 4, inner_length: 6, bearing: 0 });
    expect(r.beam_length).toBe(4);
  });
});

// ── Override / forcing behaviors ───────────────────────────────

describe("calculateSlab — overrides", () => {
  it("explicit pattern override wins over auto-pick (no pitch bump)", () => {
    // 4×6 auto picks BGB; user forces GB → should keep N=10
    const r = calculateSlab({ inner_width: 4, inner_length: 6, pattern: "GB" });
    expect(r.pattern).toBe("GB");
    expect(r.pitches).toBe(10);
    expect(r.beam_count).toBe(10);
    expect(r.block_rows).toBe(10);
    expect(r.pattern_auto).toBe("BGB"); // informational
  });

  it("force_start_beam promotes auto-GB → BGB", () => {
    // 4 × (10 pitches exactly) → auto GB; force_start_beam → BGB
    const exact = 10 * PITCH;
    const r = calculateSlab({ inner_width: 4, inner_length: exact, force_start_beam: true });
    expect(r.pattern_auto).toBe("GB");
    expect(r.pattern).toBe("BGB");
    expect(r.beam_count).toBe(11);
  });

  it("force_start_beam promotes explicit GB → BGB too (any GB → BGB)", () => {
    const r = calculateSlab({
      inner_width: 4,
      inner_length: 10 * PITCH,
      pattern: "GB",
      force_start_beam: true,
    });
    expect(r.pattern).toBe("BGB");
    expect(r.beam_count).toBe(11);
  });

  it("force_start_beam is a no-op for BGB (already starts with a beam)", () => {
    const bgb = calculateSlab({ inner_width: 4, inner_length: 6, pattern: "BGB", force_start_beam: true });
    expect(bgb.pattern).toBe("BGB");
    expect(bgb.pitches).toBe(10);
    expect(bgb.beam_count).toBe(11);
  });
  // GBG + force_start_beam IS NOT a no-op — it triggers the GBG→GB conversion.
  // That behavior is asserted in the dedicated section below.
});

// ── Visual length / area extends with extras WITHOUT changing billed area ──

describe("calculateSlab — manual extras extend monolith visually but not billed area", () => {
  it("Auto GB-at-N+1 (4×6 + 0.30) plus 1 extra beam: shows 4.30×6.50 but bills 4.30×6.38", () => {
    const r = calculateSlab({
      inner_width: 4,
      inner_length: 6,
      correction: 0.30,
      extra_beams: 1,
    });
    expect(r.pattern).toBe("GB");
    expect(r.pitches).toBe(11);
    expect(r.beam_count).toBe(12); // 11 + 1 manual
    // Visual ↑
    expect(r.monolith_length).toBeCloseTo(6.50, 3); // 11×0.58 + 0 + 1×0.12
    expect(r.monolith_area).toBeCloseTo(27.95, 2);  // 4.30 × 6.50
    // Billed ⇄ unchanged
    expect(r.billed_length).toBeCloseTo(6.38, 3);
    expect(r.billed_area).toBeCloseTo(27.434, 3);
    // Pricing splits cleanly
    expect(r.m2_cost).toBeCloseTo(27.434 * 140_000, 0);
    expect(r.manual_extra_beams_cost).toBe(4.30 * 60_000);
  });

  it("Auto GB-at-N+1 with force_start_beam: BGB pattern, monolith = 6.50, billed = 6.38", () => {
    const r = calculateSlab({
      inner_width: 4,
      inner_length: 6,
      correction: 0.30,
      force_start_beam: true,
    });
    expect(r.pattern_auto).toBe("GB");
    expect(r.pattern).toBe("BGB");
    expect(r.pitches).toBe(11);
    expect(r.beam_count).toBe(12);                 // 11 + 1 (BGB pattern)
    expect(r.monolith_length).toBeCloseTo(6.50, 3); // 11×0.58 + 0.12 (BGB ext)
    expect(r.billed_length).toBeCloseTo(6.38, 3);
    expect(r.billed_area).toBeCloseTo(27.434, 3);
    // Pattern's extra beam billed at per-meter
    expect(r.pattern_extra_cost).toBe(4.30 * 60_000);
    expect(r.manual_extra_beams_cost).toBe(0);
  });

  it("BGB with manual extras stacks pattern + manual visual extensions", () => {
    // 4×6 → auto BGB at N=10. +1 manual extra beam.
    const r = calculateSlab({ inner_width: 4, inner_length: 6, extra_beams: 1 });
    expect(r.pattern).toBe("BGB");
    expect(r.beam_count).toBe(10 + 1 + 1);                      // pitches + BGB beam + manual
    expect(r.monolith_length).toBeCloseTo(5.80 + 0.12 + 0.12, 3); // 6.04
    expect(r.billed_length).toBeCloseTo(5.80, 3);
    expect(r.billed_area).toBeCloseTo(24.94, 2);
    expect(r.m2_cost).toBeCloseTo(24.94 * 140_000, 0);
    expect(r.pattern_extra_cost).toBe(4.30 * 60_000);
    expect(r.manual_extra_beams_cost).toBe(4.30 * 60_000);
  });

  it("GBG + 0 extras stays GBG (no conversion without an added beam)", () => {
    // GBG billing rule: closing block row is m²-billed via the
    // expanded billed_length (= monolith_length), and pattern_extra_cost
    // is 0 — the per-block charge that used to exist is gone.
    const r = calculateSlab({ inner_width: 4, inner_length: 4.3 });
    expect(r.pattern_auto).toBe("GBG");
    expect(r.pattern).toBe("GBG");
    expect(r.pitches).toBe(7);
    expect(r.beam_count).toBe(7);
    expect(r.block_rows).toBe(8);
    expect(r.total_blocks).toBe(160);
    expect(r.monolith_length).toBeCloseTo(7 * 0.58 + 0.45, 3); // 4.51
    expect(r.billed_length).toBeCloseTo(7 * 0.58 + 0.45, 3);   // 4.51
    expect(r.pattern_extra_cost).toBe(0);                       // no separate block extras
    expect(r.manual_extra_beams_cost).toBe(0);
  });

  it("GBG + 2 manual extras → 1 absorbed into pattern → GB at pitches+1, 1 stays manual", () => {
    // 4 × 4.3 → auto GBG at 7 pitches.
    // 1st extra promotes pattern to GB at 8 pitches; 2nd is a per-meter line item.
    const r = calculateSlab({ inner_width: 4, inner_length: 4.3, extra_beams: 2 });
    expect(r.pattern_auto).toBe("GBG");
    expect(r.pattern).toBe("GB");
    expect(r.pitches).toBe(8);
    expect(r.beam_count).toBe(8 + 1);                          // GB count + 1 remaining manual
    expect(r.block_rows).toBe(8);
    expect(r.total_blocks).toBe(160);
    expect(r.monolith_length).toBeCloseTo(8 * 0.58 + 0.12, 3); // 4.76
    expect(r.billed_length).toBeCloseTo(8 * 0.58, 3);          // 4.64 (NOT 4.06)
    expect(r.billed_area).toBeCloseTo(4.30 * 4.64, 2);
    expect(r.pattern_extra_cost).toBe(0);                      // GB has no pattern extras
    expect(r.manual_extra_beams_cost).toBe(1 * 4.30 * 60_000); // only 1 remaining
  });

  it("Plain GB at N pitches with N extras: monolith grows by N × 0.12; billed locked at pitches × PITCH", () => {
    // Use a length that auto-picks GB (R = 0): 5.80 m exactly = 10 pitches
    const r = calculateSlab({ inner_width: 4, inner_length: 10 * PITCH, extra_beams: 3 });
    expect(r.pattern).toBe("GB");
    expect(r.pitches).toBe(10);
    expect(r.monolith_length).toBeCloseTo(5.80 + 3 * 0.12, 3); // 6.16
    expect(r.billed_length).toBeCloseTo(5.80, 3);
    expect(r.billed_area).toBeCloseTo(24.94, 2);
    expect(r.m2_cost).toBeCloseTo(24.94 * 140_000, 0);
    expect(r.pattern_extra_cost).toBe(0);                       // pure GB, no pattern extra
    expect(r.manual_extra_beams_cost).toBeCloseTo(3 * 4.30 * 60_000, 0); // 774,000 UZS
  });

  // ── User's GBG → GB conversion rule ─────────────────────────────

  it("Explicit GBG (4×6) + 1 extra beam via +B → GB at pitches+1, billed as full Г-Б", () => {
    // 4×6 → pitches base 10. Explicit GBG: block_rows=11, beam_count=10.
    // +1 beam balances the extra block row → GB at 11 pitches, 11 beams ↔ 11 blocks.
    const r = calculateSlab({ inner_width: 4, inner_length: 6, pattern: "GBG", extra_beams: 1 });
    expect(r.pattern).toBe("GB");
    expect(r.pitches).toBe(11);
    expect(r.beam_count).toBe(11);                       // pattern only, no leftover manual
    expect(r.block_rows).toBe(11);
    expect(r.total_blocks).toBe(220);
    expect(r.monolith_length).toBeCloseTo(6.38, 3);
    expect(r.billed_length).toBeCloseTo(6.38, 3);        // billed length matches monolith now
    expect(r.billed_area).toBeCloseTo(27.434, 3);
    expect(r.pattern_extra_cost).toBe(0);                // no GBG block extras
    expect(r.manual_extra_beams_cost).toBe(0);           // the manual was absorbed
    expect(r.subtotal).toBeCloseTo(27.434 * 140_000, 0); // pure m² rate
  });

  it("Explicit GBG (4×6) + force_start_beam → GB at pitches+1 (StartB consumed by conversion)", () => {
    const r = calculateSlab({ inner_width: 4, inner_length: 6, pattern: "GBG", force_start_beam: true });
    expect(r.pattern).toBe("GB");
    expect(r.pitches).toBe(11);
    expect(r.beam_count).toBe(11);
    expect(r.subtotal).toBeCloseTo(27.434 * 140_000, 0);
  });

  it("Explicit GBG + force_start_beam + 1 manual = GB at pitches+1, 1 manual extra remains", () => {
    // force_start_beam consumes the conversion; the +B count survives.
    const r = calculateSlab({
      inner_width: 4,
      inner_length: 6,
      pattern: "GBG",
      force_start_beam: true,
      extra_beams: 1,
    });
    expect(r.pattern).toBe("GB");
    expect(r.pitches).toBe(11);
    expect(r.beam_count).toBe(11 + 1);
    expect(r.monolith_length).toBeCloseTo(6.38 + 0.12, 3);
    expect(r.billed_length).toBeCloseTo(6.38, 3);
    expect(r.subtotal).toBeCloseTo(27.434 * 140_000 + 4.30 * 60_000, 0);
  });

  it("Auto-picked GBG (4×4.3) + 1 extra still triggers conversion to GB at pitches+1", () => {
    const r = calculateSlab({ inner_width: 4, inner_length: 4.3, extra_beams: 1 });
    expect(r.pattern_auto).toBe("GBG");
    expect(r.pattern).toBe("GB");
    expect(r.pitches).toBe(8);
    expect(r.beam_count).toBe(8);
    expect(r.subtotal).toBeCloseTo(8 * 0.58 * 4.30 * 140_000, 0);
  });

  it("Concrete volume tracks the physical slab (no manual-extra inflation)", () => {
    // Without extras
    const r0 = calculateSlab({ inner_width: 4, inner_length: 10 * PITCH });
    // With 5 extras
    const r5 = calculateSlab({ inner_width: 4, inner_length: 10 * PITCH, extra_beams: 5 });
    // monolith_length differs by 5 × 0.12 = 0.60
    expect(r5.monolith_length - r0.monolith_length).toBeCloseTo(0.60, 3);
    // concrete_volume identical
    expect(r5.concrete_volume).toBeCloseTo(r0.concrete_volume, 4);
  });
});

// ── Validation ──────────────────────────────────────────────────

describe("calculateSlab — validation", () => {
  it("rejects non-positive inner_width", () => {
    expect(() => calculateSlab({ inner_width: 0, inner_length: 6 })).toThrow(CalculationError);
    expect(() => calculateSlab({ inner_width: -1, inner_length: 6 })).toThrow(CalculationError);
  });
  it("rejects non-positive inner_length", () => {
    expect(() => calculateSlab({ inner_width: 4, inner_length: 0 })).toThrow(CalculationError);
  });
  it("rejects NaN / Infinity", () => {
    expect(() => calculateSlab({ inner_width: NaN, inner_length: 6 })).toThrow(CalculationError);
    expect(() => calculateSlab({ inner_width: 4, inner_length: Infinity })).toThrow(CalculationError);
  });
  it("rejects negative bearing", () => {
    expect(() => calculateSlab({ inner_width: 4, inner_length: 6, bearing: -0.1 })).toThrow(CalculationError);
  });
  it("rejects non-integer or negative extra_beams", () => {
    expect(() => calculateSlab({ inner_width: 4, inner_length: 6, extra_beams: 1.5 })).toThrow(CalculationError);
    expect(() => calculateSlab({ inner_width: 4, inner_length: 6, extra_beams: -1 })).toThrow(CalculationError);
  });
});

// ── Project total + discount ────────────────────────────────────

describe("projectTotal — grand total with optional discount", () => {
  it("sums room subtotals and applies discount on the grand total", () => {
    const room1 = calculateSlab({ inner_width: 4, inner_length: 6 });           // BGB
    const room2 = calculateSlab({ inner_width: 4, inner_length: 4.3 });         // GBG
    const sum = room1.subtotal + room2.subtotal;

    const t0 = projectTotal([room1, room2]);
    expect(t0.rooms_subtotal).toBeCloseTo(sum, 2);
    expect(t0.discount_amount).toBe(0);
    expect(t0.total).toBeCloseTo(sum, 2);

    const t10 = projectTotal([room1, room2], 10);
    expect(t10.discount_amount).toBeCloseTo(sum * 0.1, 2);
    expect(t10.total).toBeCloseTo(sum * 0.9, 2);
  });

  it("clamps discount_percent into [0, 100]", () => {
    const r = calculateSlab({ inner_width: 4, inner_length: 6 });
    expect(projectTotal([r], 150).discount_percent).toBe(100);
    expect(projectTotal([r], -5).discount_percent).toBe(0);
  });
});
