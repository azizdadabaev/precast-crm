import { describe, it, expect } from "vitest";
import { planStockReconcile, type ReconcileOrder } from "@/lib/gazoblok-reconcile";

const base = (over: Partial<ReconcileOrder>): ReconcileOrder => ({
  id: "o1",
  orderNumber: "B-2026-10-0001",
  status: "PLACED",
  lines: [{ id: "A", productId: "pA", productLabel: "600×300×200" }],
  shipments: [{ id: "s1", number: 1, status: "LOADED", loadedLines: { A: 150 } }],
  movements: [],
  placedEventActorId: null,
  createdById: "u0",
  ...over,
});

describe("planStockReconcile", () => {
  it("writes off blocks already loaded on an open order", () => {
    const p = planStockReconcile([base({})], new Set());
    expect(p.moves).toEqual([
      { orderId: "o1", orderNumber: "B-2026-10-0001", shipmentId: "s1", productId: "pA", label: "600×300×200", change: -150 },
    ]);
  });

  it("only posts what is not yet posted for that shipment", () => {
    const p = planStockReconcile([base({ movements: [{ shipmentId: "s1", productId: "pA", change: -100 }] })], new Set());
    expect(p.moves.map((m) => m.change)).toEqual([-50]);
  });

  it("leaves delivered orders alone (already written off)", () => {
    const p = planStockReconcile([base({ status: "DELIVERED" })], new Set());
    expect(p.moves).toEqual([]);
  });

  it("lists cancelled orders with loads and moves only the ones the owner names", () => {
    const o = base({ status: "CANCELED" });
    const skipped = planStockReconcile([o], new Set());
    expect(skipped.moves).toEqual([]);
    expect(skipped.canceledWithLoads).toEqual([{ orderNumber: "B-2026-10-0001", blocks: 150 }]);
    const named = planStockReconcile([o], new Set(["B-2026-10-0001"]));
    expect(named.moves.map((m) => m.change)).toEqual([-150]);
  });

  it("ignores pending trucks and loads on lines not on the order", () => {
    const p = planStockReconcile(
      [base({ shipments: [
        { id: "s1", number: 1, status: "PENDING", loadedLines: { A: 10 } },
        { id: "s2", number: 2, status: "DELIVERED", loadedLines: { A: 20, ghost: 9 } },
      ] })],
      new Set(),
    );
    expect(p.moves.map((m) => [m.shipmentId, m.change])).toEqual([["s2", -20]]);
  });

  it("backfills the selling operator from the ORDER_PLACED event", () => {
    const p = planStockReconcile([base({ createdById: null, placedEventActorId: "u1", shipments: [] })], new Set());
    expect(p.createdByBackfill).toEqual([{ orderId: "o1", userId: "u1" }]);
  });
});
