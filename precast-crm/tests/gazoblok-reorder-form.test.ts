import { describe, it, expect } from "vitest";
import { reorderPrefill, optionalNumber } from "@/lib/gazoblok-reorder-form";
import { parseMoney } from "@/lib/gazoblok-text";
import { parseDecimal } from "@/lib/gazoblok-quantities";
import type { ReorderDraft } from "@/lib/gazoblok-reorder";

const draft: ReorderDraft = {
  source: { id: "o1", orderNumber: "B-2026-11-0012", placedAt: "2026-11-01T05:00:00.000Z", status: "DELIVERED" },
  client: { name: "Тест Мижоз", phone: "998901112233", address: null },
  lines: [
    { productId: "p1", label: "600×300×200", quantity: 200, unitPrice: 19000, previousUnitPrice: 18000, previousLoaded: 220 },
    { productId: "p2", label: "600×300×100", quantity: 50, unitPrice: 12000, previousUnitPrice: 12000, previousLoaded: 50 },
  ],
  dropped: [{ label: "600×250×300", quantity: 40 }],
  previous: { deliveryCost: 300000, discountPercent: 5, scheduledAt: "2026-11-03T00:00:00.000Z" },
};

describe("reorderPrefill", () => {
  it("fills the client and the ordered quantities at today's price", () => {
    const f = reorderPrefill(draft);
    expect(f.client).toEqual({ name: "Тест Мижоз", phone: "+998 90 111 22 33", address: "" });
    expect(f.lines).toEqual([
      { productId: "p1", productLabel: "600×300×200", unitPrice: 19000, quantity: 200 },
      { productId: "p2", productLabel: "600×300×100", unitPrice: 12000, quantity: 50 },
    ]);
  });

  it("notes the previous load, and the previous price only when it changed", () => {
    const f = reorderPrefill(draft);
    expect(f.notes.p1).toEqual({ previousLoaded: 220, previousUnitPrice: 18000 });
    expect(f.notes.p2).toEqual({ previousLoaded: 50, previousUnitPrice: null });
  });

  it("never copies delivery, discount or date — they come back as hints only", () => {
    const f = reorderPrefill(draft) as Record<string, unknown>;
    expect(f.deliveryCost).toBeUndefined();
    expect(f.discountPercent).toBeUndefined();
    expect(f.scheduledAt).toBeUndefined();
    expect(f.hints).toEqual({ deliveryCost: 300000, discountPercent: 5 });
    expect(f.dropped).toEqual([{ label: "600×250×300", quantity: 40 }]);
  });

  it("every size archived → no lines, all listed as dropped", () => {
    const f = reorderPrefill({ ...draft, lines: [], dropped: [{ label: "A", quantity: 1 }] });
    expect(f.lines).toEqual([]);
    expect(f.dropped).toHaveLength(1);
  });
});

describe("optionalNumber", () => {
  it("empty → undefined, invalid → null, else the number", () => {
    expect(optionalNumber("  ", parseMoney)).toBeUndefined();
    expect(optionalNumber("1 000 000", parseMoney)).toBe(1000000);
    expect(optionalNumber("12,500", parseMoney)).toBeNull();
    expect(optionalNumber("7,5", parseDecimal)).toBe(7.5);
    expect(optionalNumber("abc", parseDecimal)).toBeNull();
  });
});
