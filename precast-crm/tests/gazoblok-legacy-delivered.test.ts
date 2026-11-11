import { describe, expect, it } from "vitest";
import { deliveredWithoutTrucks, displayLineQuantities } from "@/lib/gazoblok-quantities";
import { orderListExtras } from "@/lib/gazoblok-order-list";
import { loadSummary } from "@/lib/gazoblok-detail";
import { gazoblokExportRow, type GazoblokExportInput } from "@/lib/gazoblok-export";

const line = { id: "l1", productId: "p1", productLabel: "20 см", quantity: 300 };

describe("orders delivered before per-truck records (no trucks on file)", () => {
  it("a delivered order with no trucks shows everything ordered as loaded", () => {
    expect(deliveredWithoutTrucks("DELIVERED", [])).toBe(true);
    expect(displayLineQuantities([line], [], "DELIVERED")).toEqual([
      { lineId: "l1", productId: "p1", label: "20 см", ordered: 300, loaded: 300, left: 0, over: 0 },
    ]);
  });

  it("trucks with empty loads count as no trucks", () => {
    expect(deliveredWithoutTrucks("DELIVERED", [{ loadedLines: {} }, { loadedLines: null }])).toBe(true);
  });

  it("a delivered order with real truck records keeps its real numbers", () => {
    const q = displayLineQuantities([line], [{ loadedLines: { l1: 280 } }], "DELIVERED");
    expect(deliveredWithoutTrucks("DELIVERED", [{ loadedLines: { l1: 280 } }])).toBe(false);
    expect(q[0].loaded).toBe(280);
    expect(q[0].left).toBe(20);
  });

  it("an open order with no trucks is still 0 loaded", () => {
    expect(deliveredWithoutTrucks("PLACED", [])).toBe(false);
    expect(displayLineQuantities([line], [], "PLACED")[0].loaded).toBe(0);
  });

  it("orders list: loaded = ordered and flagged", () => {
    const x = orderListExtras({ status: "DELIVERED", totalBlocks: 300, totalPrice: 5100000, confirmedPaid: 5100000, overshipAmount: 0, shipments: [] });
    expect(x.loadedBlocks).toBe(300);
    expect(x.deliveredWithoutTrucks).toBe(true);
    const open = orderListExtras({ status: "PLACED", totalBlocks: 300, totalPrice: 5100000, confirmedPaid: 0, overshipAmount: 0, shipments: [] });
    expect(open.loadedBlocks).toBe(0);
    expect(open.deliveredWithoutTrucks).toBe(false);
  });

  it("order page: everything counts as delivered, nothing on the road", () => {
    const s = loadSummary(displayLineQuantities([line], [], "DELIVERED"), [], { deliveredWithoutTrucks: true });
    expect(s.total.loaded).toBe(300);
    expect(s.total.delivered).toBe(300);
    expect(s.total.onRoad).toBe(0);
    expect(s.total.left).toBe(0);
  });

  it("Excel export: blocks loaded = ordered", () => {
    const input = {
      id: "o1", orderNumber: "B-2026-10-0006", status: "DELIVERED", placedAt: new Date("2026-10-24"), scheduledAt: null,
      deliveredAt: null, client: { name: "x", phone: "1" }, createdBy: null, lines: [line],
      linesSubtotal: 5100000, discountAmount: 0, deliveryCost: 0, overshipAmount: 0, totalPrice: 5100000, confirmedPaid: 5100000,
      notes: null, shipments: [], payments: [],
    } as unknown as GazoblokExportInput;
    const row = gazoblokExportRow(input);
    expect(row.blocksLoaded).toBe(300);
    expect(row.blocksOver).toBe(0);
  });
});
