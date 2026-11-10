import { describe, expect, it } from "vitest";
import {
  GAZOBLOK_EXPORT_COLUMNS,
  gazoblokExportRow,
  type GazoblokExportInput,
} from "@/lib/gazoblok-export";

const SPEC_HEADERS = [
  "Order #",
  "Status",
  "Payment state",
  "Client name",
  "Client phone",
  "Client address",
  "Seller",
  "Placed at",
  "Scheduled at",
  "Delivered at",
  "Canceled at",
  "Cancel reason",
  "Short closed at",
  "Short close reason",
  "Lines",
  "Blocks ordered",
  "Blocks loaded",
  "Blocks over",
  "Volume m³",
  "Lines subtotal",
  "Discount %",
  "Discount amount",
  "Delivery cost",
  "Over-load amount",
  "Total price",
  "Confirmed paid",
  "Pending paid",
  "Remaining",
  "Unpaid over-load",
  "Trucks",
  "Notes",
  "Order ID",
];

function order(over: Partial<GazoblokExportInput> = {}): GazoblokExportInput {
  return {
    id: "go1",
    orderNumber: "B-2026-11-0001",
    status: "PLACED",
    paymentState: "PARTIALLY_PAID",
    client: { name: "Ali", phone: "+998901112233", address: "Toshkent" },
    createdBy: { name: "Operator 1" },
    placedAt: new Date("2026-11-01T08:00:00Z"),
    scheduledAt: new Date("2026-11-03T08:00:00Z"),
    deliveredAt: null,
    canceledAt: null,
    cancelReason: null,
    shortClosedAt: null,
    shortCloseReason: null,
    totalVolumeM3: 8.352,
    linesSubtotal: 2_000_000,
    discountPercent: 0,
    discountAmount: 0,
    deliveryCost: 300_000,
    overshipAmount: 320_000,
    totalPrice: 2_620_000,
    confirmedPaid: 1_000_000,
    notes: null,
    lines: [{ id: "A", productId: "p1", productLabel: "600×300×200", quantity: 200 }],
    shipments: [
      { status: "DELIVERED", loadedLines: { A: 120 } },
      { status: "LOADED", loadedLines: { A: 112 } },
      { status: "PENDING", loadedLines: null },
    ],
    payments: [
      { amount: 1_000_000, status: "CONFIRMED" },
      { amount: 500_000, status: "PENDING_CONFIRMATION" },
      { amount: 99, status: "REJECTED" },
    ],
    ...over,
  };
}

describe("gazoblok Excel export", () => {
  it("header list equals the spec list, in order", () => {
    expect(GAZOBLOK_EXPORT_COLUMNS.map((c) => c.header)).toEqual(SPEC_HEADERS);
  });

  it("every column key is present in the row", () => {
    const row = gazoblokExportRow(order());
    for (const c of GAZOBLOK_EXPORT_COLUMNS) expect(row).toHaveProperty(c.key);
    expect(Object.keys(row).sort()).toEqual(GAZOBLOK_EXPORT_COLUMNS.map((c) => c.key).sort());
  });

  it("lines, block counts and trucks read ordered/loaded", () => {
    const row = gazoblokExportRow(order());
    expect(row.lines).toBe("600×300×200: 200/232");
    expect(row.blocksOrdered).toBe(200);
    expect(row.blocksLoaded).toBe(232);
    expect(row.blocksOver).toBe(32);
    expect(row.trucks).toBe("2/3");
  });

  it("money: pending, remaining = max(0, total − confirmed − pending), unpaid over-load", () => {
    const row = gazoblokExportRow(order());
    expect(row.pendingPaid).toBe(500_000);
    expect(row.remaining).toBe(1_120_000);
    expect(row.unpaidOverload).toBe(320_000);
    const paid = gazoblokExportRow(order({ confirmedPaid: 2_620_000, payments: [{ amount: 100, status: "PENDING_CONFIRMATION" }] }));
    expect(paid.remaining).toBe(0);
    expect(paid.unpaidOverload).toBe(0);
  });

  it("seller is createdBy name or empty for legacy orders", () => {
    expect(gazoblokExportRow(order()).seller).toBe("Operator 1");
    expect(gazoblokExportRow(order({ createdBy: null })).seller).toBe("");
  });
});
