import { describe, expect, it } from "vitest";
import { formatNumber } from "@/lib/utils";
import { shareCaption, shareSummary, type ShareOrder } from "@/components/gazoblok/gazoblok-share";

const dims = { lengthM: "0.600", heightM: "0.300", thicknessM: "0.200" }; // 0.036 m³ ≈ 22 kg
const base: ShareOrder = {
  orderNumber: "B-2026-11-0007",
  client: { name: "Алишер" },
  shortClosedAt: null,
  linesSubtotal: "1000000",
  discountAmount: "50000",
  deliveryCost: "300000",
  overshipAmount: "0",
  totalPrice: "1250000",
  totalBlocks: 100,
  totalVolumeM3: "3.600",
  lines: [{ id: "l1", productLabel: "600×300×200", unitPrice: "10000", quantity: 100, product: dims }],
  shipments: [],
};

describe("gazoblok share card", () => {
  it("open order: rows carry ordered quantities, totals reconcile", () => {
    const s = shareSummary(base);
    expect(s.rows).toEqual([{ key: "l1", label: "600×300×200", quantity: 100, unitPrice: 10000, sum: 1000000 }]);
    expect(s.subtotal).toBe(1000000);
    expect(s.overship).toBe(0);
    expect(s.total).toBe(1250000);
    expect(s.subtotal - s.discount + s.delivery + s.overship).toBe(s.total);
    expect(s.volumeM3).toBeCloseTo(3.6, 6);
    expect(s.weightKg).toBeCloseTo(3.6 * 611, 6);
  });

  it("open order with an over-load shows it as its own line", () => {
    const s = shareSummary({
      ...base,
      overshipAmount: "100000",
      totalPrice: "1350000",
      shipments: [{ loadedLines: { l1: 110 } }],
    });
    expect(s.rows[0].quantity).toBe(100);
    expect(s.overship).toBe(100000);
    expect(s.subtotal - s.discount + s.delivery + s.overship).toBe(s.total);
  });

  it("closed short: rows carry loaded quantities and the over-load sits inside them", () => {
    const s = shareSummary({
      ...base,
      shortClosedAt: "2026-11-09T10:00:00.000Z",
      linesSubtotal: "400000",
      discountAmount: "20000",
      totalPrice: "680000",
      shipments: [{ loadedLines: { l1: 40 } }],
    });
    expect(s.rows[0].quantity).toBe(40);
    expect(s.subtotal).toBe(400000);
    expect(s.overship).toBe(0);
    expect(s.subtotal - s.discount + s.delivery + s.overship).toBe(s.total);
    expect(s.weightKg).toBeCloseTo(40 * 0.036 * 611, 6);
  });

  it("a line whose product was deleted weighs the order's average block", () => {
    const s = shareSummary({ ...base, lines: [{ ...base.lines[0], product: null }] });
    expect(s.volumeM3).toBeCloseTo(3.6, 6);
  });

  it("caption mirrors beam-and-block", () => {
    const w = formatNumber(Math.round(3.6 * 611), 0);
    expect(shareCaption(base)).toBe(`№B-2026-11-0007 · Алишер
Жами: ${formatNumber(1250000, 0)} so'm
Оғирлик: ${w} кг`);
  });
});
