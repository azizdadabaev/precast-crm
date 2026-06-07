import { describe, it, expect } from "vitest";
import { computeOrderTotals } from "@/lib/order-totals";
import { calcResultToCreatePayload, type RoomInput } from "@/lib/calc-persistence";
import {
  calculateSlab,
  DEFAULT_PRICE_CONFIG,
  M2_PRICE_TIERS,
  CalculationError,
} from "@/services/calculation-engine";

const NO_DISCOUNT = {
  discountPercent: 0,
  discountAmount: 0,
  deliveryCost: 0,
  otherCost: 0,
};

function room(overrides: Partial<RoomInput> = {}): RoomInput {
  return {
    innerWidth: 4,
    innerLength: 5,
    bearing: 0.15,
    correction: 0,
    extraBeams: 0,
    forceStartBeam: false,
    patternOverride: null,
    m2PriceOverride: false,
    m2PriceOverrideValue: null,
    m2PriceReason: null,
    ...overrides,
  };
}

describe("computeOrderTotals", () => {
  it("rolls up per-room engine numbers (area/blocks/beams/subtotal)", () => {
    const r1 = room({ innerWidth: 4, innerLength: 5 });
    const r2 = room({ innerWidth: 3.5, innerLength: 6 });
    const e1 = calculateSlab(
      { inner_width: 4, inner_length: 5, bearing: 0.15, correction: 0, extra_beams: 0, force_start_beam: false },
      DEFAULT_PRICE_CONFIG,
    );
    const e2 = calculateSlab(
      { inner_width: 3.5, inner_length: 6, bearing: 0.15, correction: 0, extra_beams: 0, force_start_beam: false },
      DEFAULT_PRICE_CONFIG,
    );

    const t = computeOrderTotals([r1, r2], NO_DISCOUNT, DEFAULT_PRICE_CONFIG);

    expect(t.totalArea).toBe(e1.monolith_area + e2.monolith_area);
    expect(t.totalBlocks).toBe(e1.total_blocks + e2.total_blocks);
    expect(t.totalBeams).toBe(e1.beam_count + e2.beam_count);
    expect(t.roomsSubtotal).toBe(
      Number(calcResultToCreatePayload(r1, e1).subtotal) +
        Number(calcResultToCreatePayload(r2, e2).subtotal),
    );
    expect(t.totalPrice).toBe(t.roomsSubtotal); // no discount, no extra costs
  });

  it("amount discount wins, caps at subtotal, and back-computes percent", () => {
    const base = computeOrderTotals([room()], NO_DISCOUNT, DEFAULT_PRICE_CONFIG);
    const sub = base.roomsSubtotal;
    const t = computeOrderTotals(
      [room()],
      { ...NO_DISCOUNT, discountAmount: Math.round(sub / 4), discountPercent: 99 },
      DEFAULT_PRICE_CONFIG,
    );
    expect(t.discountAmount).toBe(Math.round(sub / 4));
    // percent is derived from the amount, NOT the supplied discountPercent
    expect(t.resolvedDiscountPercent).toBe(
      Math.round((Math.round(sub / 4) / sub) * 10000) / 100,
    );
    expect(t.totalPrice).toBe(sub - Math.round(sub / 4));
  });

  it("caps an over-large amount discount at the subtotal (total never negative)", () => {
    const base = computeOrderTotals([room()], NO_DISCOUNT, DEFAULT_PRICE_CONFIG);
    const t = computeOrderTotals(
      [room()],
      { ...NO_DISCOUNT, discountAmount: base.roomsSubtotal * 10 },
      DEFAULT_PRICE_CONFIG,
    );
    expect(t.discountAmount).toBe(base.roomsSubtotal);
    expect(t.resolvedDiscountPercent).toBe(100);
    expect(t.totalPrice).toBe(0);
  });

  it("applies the percentage path when no amount is given", () => {
    const base = computeOrderTotals([room()], NO_DISCOUNT, DEFAULT_PRICE_CONFIG);
    const t = computeOrderTotals(
      [room()],
      { ...NO_DISCOUNT, discountPercent: 10 },
      DEFAULT_PRICE_CONFIG,
    );
    expect(t.resolvedDiscountPercent).toBe(10);
    expect(t.discountAmount).toBe(base.roomsSubtotal * 0.1);
    expect(t.totalPrice).toBe(base.roomsSubtotal * 0.9);
  });

  it("adds delivery + other costs after the discount", () => {
    const base = computeOrderTotals([room()], NO_DISCOUNT, DEFAULT_PRICE_CONFIG);
    const t = computeOrderTotals(
      [room()],
      { discountPercent: 0, discountAmount: 0, deliveryCost: 500_000, otherCost: 100_000 },
      DEFAULT_PRICE_CONFIG,
    );
    expect(t.totalPrice).toBe(base.roomsSubtotal + 500_000 + 100_000);
  });

  it("honors a per-row catalog-tier rate override in roomsSubtotal", () => {
    const tier = M2_PRICE_TIERS[M2_PRICE_TIERS.length - 1].price; // a real catalog tier
    const r = room({ m2PriceOverride: true, m2PriceOverrideValue: tier, m2PriceReason: "test" });
    const e = calculateSlab(
      { inner_width: 4, inner_length: 5, bearing: 0.15, correction: 0, extra_beams: 0, force_start_beam: false },
      DEFAULT_PRICE_CONFIG,
    );
    const t = computeOrderTotals([r], NO_DISCOUNT, DEFAULT_PRICE_CONFIG);
    expect(t.roomsSubtotal).toBe(Number(calcResultToCreatePayload(r, e).subtotal));
  });

  it("uses the injected pricing config (doubling tier prices changes totals)", () => {
    const base = computeOrderTotals([room()], NO_DISCOUNT, DEFAULT_PRICE_CONFIG);
    const bumped = {
      ...DEFAULT_PRICE_CONFIG,
      m2_price_tiers: DEFAULT_PRICE_CONFIG.m2_price_tiers.map((tt) => ({ ...tt, price: tt.price * 2 })),
    };
    const t = computeOrderTotals([room()], NO_DISCOUNT, bumped);
    expect(t.roomsSubtotal).not.toBe(base.roomsSubtotal);
  });

  it("propagates CalculationError on invalid room input", () => {
    expect(() =>
      computeOrderTotals([room({ innerWidth: 0, innerLength: 0, extraBeams: 0 })], NO_DISCOUNT, DEFAULT_PRICE_CONFIG),
    ).toThrow(CalculationError);
  });
});
