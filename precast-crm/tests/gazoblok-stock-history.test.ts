import { describe, expect, it } from "vitest";
import { MOVEMENT_REASON_LABELS, movementText, reservedByProduct } from "@/lib/gazoblok-stock-history";

const order = (status: string, quantity: number, loaded: number, shortClosedAt: Date | null = null) => ({
  status,
  shortClosedAt,
  lines: [{ id: "l1", productId: "pA", productLabel: "600×300×200", quantity }],
  shipments: [{ loadedLines: { l1: loaded } }],
});

describe("gazoblok stock history", () => {
  it("labels every stock reason in Uzbek", () => {
    expect(Object.keys(MOVEMENT_REASON_LABELS).sort()).toEqual(
      ["CANCELLATION_RESTOCK", "MANUAL_ADJUSTMENT", "PRODUCTION", "SALE", "SHIPMENT_CORRECTION", "SHIPMENT_LOAD"],
    );
    expect(MOVEMENT_REASON_LABELS.SALE[0]).toBe("Буюртма етказилди (эски тартиб)");
  });

  it("movementText for a truck load names the shipment and the order", () => {
    expect(
      movementText({ reason: "SHIPMENT_LOAD", note: null, shipmentNumber: 2, orderNumber: "B-2026-11-0012" }),
    ).toBe("Машина юкланди · Жўнатма 2 · B-2026-11-0012");
  });

  it("movementText does not repeat a note that only names the shipment", () => {
    expect(
      movementText({ reason: "SHIPMENT_LOAD", note: "Жўнатма 1", shipmentNumber: 1, orderNumber: "B-2026-11-0012" }),
    ).toBe("Машина юкланди · Жўнатма 1 · B-2026-11-0012");
    expect(
      movementText({ reason: "SHIPMENT_CORRECTION", note: " Жўнатма 3 ", shipmentNumber: 3, orderNumber: null }),
    ).toBe("Юк тузатилди · Жўнатма 3");
    expect(
      movementText({ reason: "SHIPMENT_LOAD", note: "Жўнатма 1", shipmentNumber: null, orderNumber: null }),
    ).toBe("Машина юкланди · «Жўнатма 1»");
  });

  it("movementText for a manual adjustment quotes the note", () => {
    expect(
      movementText({ reason: "MANUAL_ADJUSTMENT", note: "Синган блоклар", shipmentNumber: null, orderNumber: null }),
    ).toBe("Қўлда тузатиш · «Синган блоклар»");
  });

  it("reservedByProduct sums what open orders still need", () => {
    expect(reservedByProduct([order("PLACED", 200, 168)]).get("pA")).toBe(32);
    expect(reservedByProduct([order("PLACED", 200, 168), order("IN_PRODUCTION", 10, 0)]).get("pA")).toBe(42);
  });

  it("reservedByProduct ignores finished orders and over-loaded lines", () => {
    const m = reservedByProduct([
      order("DELIVERED", 200, 0),
      order("CANCELED", 200, 0),
      order("PLACED", 200, 0, new Date()),
      order("PLACED", 100, 120),
    ]);
    expect(m.get("pA") ?? 0).toBe(0);
  });
});
