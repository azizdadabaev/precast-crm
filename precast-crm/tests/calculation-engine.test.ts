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
    // 4.3 / 0.58 = 7.41 → N=7, R=0.24 → auto GBG
    const r = calculateSlab({ inner_width: 4, inner_length: 4.3 });
    expect(r.pitches).toBe(7);
    expect(r.pattern).toBe("GBG");
    expect(r.beam_count).toBe(7);            // GBG: no extra beam
    expect(r.block_rows).toBe(8);            // pitches + 1
    expect(r.total_blocks).toBe(160);        // 20 × 8
    expect(r.billed_length).toBeCloseTo(4.06, 3);
    expect(r.monolith_length).toBeCloseTo(4.51, 3); // 4.06 + 0.45
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

  it("4 × 6 GBG option: m² at 4.30×5.80 + blocks_per_row × 6,000", () => {
    const r = calculateSlab({ inner_width: 4, inner_length: 6, pattern: "GBG" });
    expect(r.pattern).toBe("GBG");
    expect(r.m2_cost).toBe(24.94 * 140_000);
    expect(r.pattern_extra_cost).toBe(20 * BLOCK_UNIT_PRICE);       // 120,000
    expect(r.subtotal).toBe(24.94 * 140_000 + 20 * BLOCK_UNIT_PRICE);
  });

  it("4 × 6 extra-pair option (correction +0.30): m² at 4.30×6.38, no extras", () => {
    const r = calculateSlab({ inner_width: 4, inner_length: 6, correction: 0.30 });
    expect(r.pattern).toBe("GB");
    expect(r.m2_cost).toBeCloseTo(27.434 * 140_000, 0);
    expect(r.pattern_extra_cost).toBe(0);
    expect(r.manual_extra_beams_cost).toBe(0);
    expect(r.subtotal).toBeCloseTo(27.434 * 140_000, 0);
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

  it("force_start_beam has no effect when explicit pattern is set", () => {
    const r = calculateSlab({
      inner_width: 4,
      inner_length: 10 * PITCH,
      pattern: "GB",
      force_start_beam: true,
    });
    expect(r.pattern).toBe("GB");
    expect(r.beam_count).toBe(10);
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
