import { describe, it, expect } from "vitest";
import { reorderDraft } from "@/lib/gazoblok-reorder";

const src = {
  id: "o1",
  orderNumber: "B-2026-11-0012",
  placedAt: new Date("2026-11-01T05:00:00.000Z"),
  status: "DELIVERED",
  deliveryCost: 300000,
  discountPercent: 5,
  scheduledAt: new Date("2026-11-03T00:00:00.000Z"),
  client: { name: "Тест Мижоз", phone: "998901112233", address: "Тошкент" },
  lines: [
    { id: "A", productId: "pA", productLabel: "old A", quantity: 200, unitPrice: 18000 },
    { id: "B", productId: "pB", productLabel: "600×300×300", quantity: 100, unitPrice: 20000 },
    { id: "C", productId: null, productLabel: "600×250×100", quantity: 50, unitPrice: 15000 },
  ],
  shipments: [{ loadedLines: { A: 120 } }, { loadedLines: { A: 100, B: 40 } }],
};

const catalog = [
  { id: "pA", label: "600×300×200", pricePerBlock: 20000, active: true },
  { id: "pB", label: "600×300×300", pricePerBlock: 21000, active: false },
];

describe("reorderDraft", () => {
  it("reorderDraft prices today and drops archived", () => {
    const d = reorderDraft(src, catalog);
    expect(d.source).toEqual({
      id: "o1",
      orderNumber: "B-2026-11-0012",
      placedAt: "2026-11-01T05:00:00.000Z",
      status: "DELIVERED",
    });
    expect(d.client).toEqual({ name: "Тест Мижоз", phone: "998901112233", address: "Тошкент" });
    expect(d.lines).toEqual([
      { productId: "pA", label: "600×300×200", quantity: 200, unitPrice: 20000, previousUnitPrice: 18000, previousLoaded: 220 },
    ]);
    expect(d.dropped).toEqual([
      { label: "600×300×300", quantity: 100 },
      { label: "600×250×100", quantity: 50 },
    ]);
    expect(d.previous).toEqual({ deliveryCost: 300000, discountPercent: 5, scheduledAt: "2026-11-03T00:00:00.000Z" });
  });

  it("a size deleted from the catalog is dropped with its old label", () => {
    const d = reorderDraft(src, [catalog[1]]);
    expect(d.dropped[0]).toEqual({ label: "old A", quantity: 200 });
  });

  it("all archived → no lines, everything dropped", () => {
    const d = reorderDraft({ ...src, scheduledAt: null }, catalog.map((p) => ({ ...p, active: false })));
    expect(d.lines).toEqual([]);
    expect(d.dropped).toHaveLength(3);
    expect(d.previous.scheduledAt).toBeNull();
  });
});
