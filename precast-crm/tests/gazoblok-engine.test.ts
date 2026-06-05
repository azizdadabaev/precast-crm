import { describe, it, expect } from "vitest";
import {
  blockVolumeM3,
  pricePerM3,
  blocksPerM3,
  estimateWall,
  lineTotal,
  orderTotal,
  GazoblokError,
  DEFAULT_WASTE_PCT,
} from "../src/services/gazoblok-engine";

// A standard 600×300×200 газоблок (dimensions in meters) priced per block.
const B_600x300x200 = { lengthM: 0.6, heightM: 0.3, thicknessM: 0.2, pricePerBlock: 18_000 };
// A thinner 600×300×100 partition block.
const B_600x300x100 = { lengthM: 0.6, heightM: 0.3, thicknessM: 0.1, pricePerBlock: 9_000 };

// ── Volume + derived price ──────────────────────────────────────

describe("blockVolumeM3 / pricePerM3 / blocksPerM3", () => {
  it("computes block volume in m³", () => {
    expect(blockVolumeM3(B_600x300x200)).toBeCloseTo(0.036, 3);
    expect(blockVolumeM3(B_600x300x100)).toBeCloseTo(0.018, 3);
  });

  it("derives price per m³ from price per block", () => {
    expect(pricePerM3(B_600x300x200)).toBe(500_000); // 18000 / 0.036
    expect(pricePerM3(B_600x300x100)).toBe(500_000); // 9000 / 0.018
  });

  it("derives blocks per m³", () => {
    expect(blocksPerM3(B_600x300x200)).toBe(27.78); // 1 / 0.036
    expect(blocksPerM3(B_600x300x100)).toBe(55.56); // 1 / 0.018
  });

  it("throws on non-positive dimensions", () => {
    expect(() => blockVolumeM3({ ...B_600x300x200, thicknessM: 0 })).toThrow(GazoblokError);
    expect(() => blockVolumeM3({ ...B_600x300x200, lengthM: -1 })).toThrow(GazoblokError);
  });
});

// ── Wall estimator ──────────────────────────────────────────────

describe("estimateWall", () => {
  it("10 × 3 m wall, no openings, no waste → 167 blocks", () => {
    const r = estimateWall(B_600x300x200, { lengthM: 10, heightM: 3, wastePct: 0 });
    expect(r.wallAreaM2).toBeCloseTo(30, 3);
    expect(r.blockFaceAreaM2).toBeCloseTo(0.18, 3); // 0.6 × 0.3
    expect(r.blocksNeeded).toBe(167); // ceil(30 / 0.18)
    expect(r.volumeM3).toBeCloseTo(6.012, 3);
    expect(r.price).toBe(3_006_000); // 167 × 18000
  });

  it("applies the default 5% waste when wastePct is omitted", () => {
    const r = estimateWall(B_600x300x200, { lengthM: 10, heightM: 3 });
    expect(r.wastePct).toBe(DEFAULT_WASTE_PCT);
    expect(r.blocksNeeded).toBe(175); // ceil(166.667 × 1.05)
    expect(r.price).toBe(3_150_000);
  });

  it("subtracts openings from the wall area", () => {
    const r = estimateWall(B_600x300x200, {
      lengthM: 10,
      heightM: 3,
      openingsM2: 3, // door + window
      wastePct: 0,
    });
    expect(r.wallAreaM2).toBeCloseTo(27, 3);
    expect(r.blocksNeeded).toBe(150); // ceil(27 / 0.18)
  });

  it("floors the wall area at 0 when openings exceed the wall", () => {
    const r = estimateWall(B_600x300x200, { lengthM: 2, heightM: 2, openingsM2: 10, wastePct: 0 });
    expect(r.wallAreaM2).toBe(0);
    expect(r.blocksNeeded).toBe(0);
    expect(r.price).toBe(0);
  });

  it("throws on invalid wall inputs", () => {
    expect(() => estimateWall(B_600x300x200, { lengthM: 0, heightM: 3 })).toThrow(GazoblokError);
    expect(() => estimateWall(B_600x300x200, { lengthM: 10, heightM: -1 })).toThrow(GazoblokError);
    expect(() =>
      estimateWall(B_600x300x200, { lengthM: 10, heightM: 3, openingsM2: -1 }),
    ).toThrow(GazoblokError);
  });
});

// ── Line + order totals ─────────────────────────────────────────

describe("lineTotal", () => {
  it("multiplies unit price by quantity", () => {
    expect(lineTotal(18_000, 3)).toBe(54_000);
  });
  it("throws on a non-integer or negative quantity", () => {
    expect(() => lineTotal(18_000, 1.5)).toThrow(GazoblokError);
    expect(() => lineTotal(18_000, -1)).toThrow(GazoblokError);
  });
});

describe("orderTotal — discount precedence + delivery", () => {
  const lines = [
    { unitPrice: 18_000, quantity: 100 }, // 1,800,000
    { unitPrice: 15_000, quantity: 50 }, //    750,000
  ];

  it("sums lines and counts blocks", () => {
    const t = orderTotal(lines);
    expect(t.linesSubtotal).toBe(2_550_000);
    expect(t.totalBlocks).toBe(150);
    expect(t.total).toBe(2_550_000);
  });

  it("applies a percentage discount", () => {
    const t = orderTotal(lines, { discountPercent: 10 });
    expect(t.discountAmount).toBe(255_000);
    expect(t.total).toBe(2_295_000);
  });

  it("adds delivery after the discount", () => {
    const t = orderTotal(lines, { discountPercent: 10, deliveryCost: 100_000 });
    expect(t.total).toBe(2_395_000);
  });

  it("an explicit amount wins over a percentage and back-computes the percent", () => {
    const t = orderTotal(lines, { discountPercent: 10, discountAmount: 300_000 });
    expect(t.discountAmount).toBe(300_000);
    expect(t.discountPercent).toBe(11.76); // 300000 / 2550000 × 100
    expect(t.total).toBe(2_250_000);
  });

  it("caps the discount amount at the subtotal so the total can't go negative", () => {
    const t = orderTotal(lines, { discountAmount: 9_999_999 });
    expect(t.discountAmount).toBe(2_550_000);
    expect(t.total).toBe(0);
  });
});
