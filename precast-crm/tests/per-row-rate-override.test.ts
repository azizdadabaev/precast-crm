import { describe, expect, it } from "vitest";
import {
  RoomCalcInputSchema,
  RoomCalcInputBaseSchema,
} from "../src/lib/validation";
import {
  M2_PRICE_TIERS,
  calculateSlab,
} from "../src/services/calculation-engine";
import { calcResultToCreatePayload } from "../src/lib/calc-persistence";

const validRoom = {
  innerWidth: 4,
  innerLength: 5,
  bearing: 0.15,
  correction: 0,
  extraBeams: 0,
  forceStartBeam: false,
};

describe("RoomCalcInputSchema — rate override validation", () => {
  it("accepts a room with no override (defaults)", () => {
    const r = RoomCalcInputSchema.safeParse(validRoom);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.m2PriceOverride).toBe(false);
    }
  });

  it("rejects a non-catalog override value", () => {
    const r = RoomCalcInputSchema.safeParse({
      ...validRoom,
      m2PriceOverride: true,
      m2PriceOverrideValue: 175_000, // not a tier
    });
    expect(r.success).toBe(false);
  });

  it("accepts every catalog tier as a valid override value", () => {
    for (const tier of M2_PRICE_TIERS) {
      const r = RoomCalcInputSchema.safeParse({
        ...validRoom,
        m2PriceOverride: true,
        m2PriceOverrideValue: tier.price,
        m2PriceReason: "owner approved",
      });
      expect(r.success).toBe(true);
    }
  });

  it("rejects override=true without an override value", () => {
    const r = RoomCalcInputSchema.safeParse({
      ...validRoom,
      m2PriceOverride: true,
      m2PriceOverrideValue: null,
    });
    expect(r.success).toBe(false);
  });

  it("rejects override=false but with an override value present", () => {
    const r = RoomCalcInputSchema.safeParse({
      ...validRoom,
      m2PriceOverride: false,
      m2PriceOverrideValue: 160_000,
    });
    expect(r.success).toBe(false);
  });

  it("rejects override=false but with a reason present", () => {
    const r = RoomCalcInputSchema.safeParse({
      ...validRoom,
      m2PriceOverride: false,
      m2PriceReason: "should not be here",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a reason longer than 200 chars", () => {
    const r = RoomCalcInputSchema.safeParse({
      ...validRoom,
      m2PriceOverride: true,
      m2PriceOverrideValue: 160_000,
      m2PriceReason: "x".repeat(201),
    });
    expect(r.success).toBe(false);
  });

  it("base (non-refined) schema does NOT apply override-pair refines", () => {
    // The /api/calculate preview endpoint uses the base schema; it
    // should accept ANY combination of override fields without
    // erroring, because preview never persists.
    const r = RoomCalcInputBaseSchema.safeParse({
      ...validRoom,
      m2PriceOverride: false,
      m2PriceOverrideValue: 160_000,
    });
    expect(r.success).toBe(true);
  });
});

describe("calcResultToCreatePayload — override math", () => {
  it("with no override, m2Price/m2Cost/subtotal match the engine output", () => {
    const result = calculateSlab({
      inner_width: 4,
      inner_length: 5,
      bearing: 0.15,
      correction: 0,
      extra_beams: 0,
      force_start_beam: false,
    });
    const payload = calcResultToCreatePayload(
      { ...validRoom, m2PriceOverride: false },
      result,
    );
    expect(Number(payload.m2Price)).toBe(result.m2_price);
    expect(Number(payload.m2Cost)).toBe(result.m2_cost);
    expect(Number(payload.subtotal)).toBe(result.subtotal);
    expect(payload.m2PriceOverride).toBe(false);
    expect(payload.m2PriceReason).toBeNull();
  });

  it("with override, m2Cost = round2(billed_area * tier) and subtotal updates accordingly", () => {
    const result = calculateSlab({
      inner_width: 4,
      inner_length: 5,
      bearing: 0.15,
      correction: 0,
      extra_beams: 0,
      force_start_beam: false,
    });
    // Default auto-pick at beam_length=4.30 is the 140k tier; force the 230k tier.
    const tier = 230_000;
    const payload = calcResultToCreatePayload(
      {
        ...validRoom,
        m2PriceOverride: true,
        m2PriceOverrideValue: tier,
        m2PriceReason: "rush job",
      },
      result,
    );
    expect(Number(payload.m2Price)).toBe(tier);
    const expectedM2Cost = Math.round(result.billed_area * tier * 100) / 100;
    expect(Number(payload.m2Cost)).toBe(expectedM2Cost);
    const expectedSubtotal =
      Math.round(
        (expectedM2Cost +
          result.pattern_extra_cost +
          result.manual_extra_beams_cost) *
          100,
      ) / 100;
    expect(Number(payload.subtotal)).toBe(expectedSubtotal);
    expect(payload.m2PriceOverride).toBe(true);
    expect(payload.m2PriceReason).toBe("rush job");
  });

  it("trims an override reason and stores empty as null", () => {
    const result = calculateSlab({
      inner_width: 4,
      inner_length: 5,
      bearing: 0.15,
      correction: 0,
      extra_beams: 0,
      force_start_beam: false,
    });
    const trimmed = calcResultToCreatePayload(
      {
        ...validRoom,
        m2PriceOverride: true,
        m2PriceOverrideValue: 160_000,
        m2PriceReason: "  spaces around  ",
      },
      result,
    );
    expect(trimmed.m2PriceReason).toBe("spaces around");

    const blank = calcResultToCreatePayload(
      {
        ...validRoom,
        m2PriceOverride: true,
        m2PriceOverrideValue: 160_000,
        m2PriceReason: "   ",
      },
      result,
    );
    expect(blank.m2PriceReason).toBeNull();
  });

  it("ignores a non-catalog override value (defense-in-depth)", () => {
    const result = calculateSlab({
      inner_width: 4,
      inner_length: 5,
      bearing: 0.15,
      correction: 0,
      extra_beams: 0,
      force_start_beam: false,
    });
    const payload = calcResultToCreatePayload(
      {
        ...validRoom,
        m2PriceOverride: true,
        m2PriceOverrideValue: 175_000, // not a tier
        m2PriceReason: "should not apply",
      },
      result,
    );
    // Should fall back to engine auto-pick.
    expect(Number(payload.m2Price)).toBe(result.m2_price);
    expect(payload.m2PriceOverride).toBe(false);
    expect(payload.m2PriceReason).toBeNull();
  });
});
