import { describe, it, expect } from "vitest";
import {
  planStockReconcile,
  invertMoves,
  planUndo,
  RECONCILE_NOTE,
  UNDO_NOTE,
  type ReconcileOrder,
} from "@/lib/gazoblok-reconcile";

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
    const p = planStockReconcile([base({ movements: [{ shipmentId: "s1", productId: "pA", change: -100, reason: "SHIPMENT_LOAD" }] })], new Set());
    expect(p.moves.map((m) => m.change)).toEqual([-50]);
  });

  it("leaves orders the old delivery already wrote off (SALE row) alone", () => {
    const p = planStockReconcile(
      [base({ status: "DELIVERED", movements: [{ shipmentId: null, productId: "pA", change: -150, reason: "SALE" }] })],
      new Set(),
    );
    expect(p.moves).toEqual([]);
  });

  it("writes off a DELIVERED order that never got the old SALE write-off (delivered after the switch)", () => {
    const p = planStockReconcile([base({ status: "DELIVERED" })], new Set());
    expect(p.moves.map((m) => m.change)).toEqual([-150]);
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

const mv = (change: number, over: Record<string, unknown> = {}) => ({ orderId: "o1", shipmentId: "s1", productId: "pA", change, ...over });

describe("invertMoves", () => {
  it("flips signs and keeps ids", () => {
    expect(invertMoves([mv(-150), mv(30, { productId: "pB" })])).toEqual([mv(150), mv(-30, { productId: "pB" })]);
  });

  it("twice is the identity", () => {
    const m = [mv(-150, { orderNumber: "B-1", label: "600×300×200" }), mv(7)];
    expect(invertMoves(invertMoves(m))).toEqual(m);
  });
});

describe("planUndo — replaying an undo file safely", () => {
  const posted = (change: number, note: string = RECONCILE_NOTE, over: Record<string, unknown> = {}) => ({
    orderId: "o1", shipmentId: "s1", productId: "pA", change, note, ...over,
  });

  it("accepts a file whose moves each cancel one posted reconcile write-off", () => {
    const p = planUndo([mv(150, { orderNumber: "B-1", label: "x" })], [posted(-150)]);
    expect(p).toEqual({ moves: [mv(150)] });
  });

  it("refuses a file that is not a list of moves", () => {
    expect(planUndo({ moves: [] }, [])).toHaveProperty("problems");
    expect(planUndo([{ orderId: "o1", shipmentId: "s1", productId: "pA", change: "150" }], [posted(-150)])).toHaveProperty("problems");
    expect(planUndo([mv(1.5)], [posted(-1.5)])).toHaveProperty("problems");
    expect(planUndo([mv(0)], [])).toHaveProperty("problems");
    expect(planUndo([], [])).toHaveProperty("problems");
  });

  it("refuses moves with no matching reconcile movement (wrong amount, wrong truck, or a normal load)", () => {
    expect(planUndo([mv(100)], [posted(-150)])).toHaveProperty("problems");
    expect(planUndo([mv(150, { shipmentId: "s2" })], [posted(-150)])).toHaveProperty("problems");
    expect(planUndo([mv(150)], [posted(-150, "Жўнатма 1")])).toHaveProperty("problems");
  });

  it("matches each posted write-off once — a duplicated line is refused", () => {
    expect(planUndo([mv(150), mv(150)], [posted(-150)])).toHaveProperty("problems");
    expect(planUndo([mv(150), mv(150)], [posted(-150), posted(-150)])).toEqual({ moves: [mv(150), mv(150)] });
  });

  it("refuses a file that was already replayed", () => {
    const p = planUndo([mv(150)], [posted(-150), posted(150, UNDO_NOTE)]);
    expect(p).toHaveProperty("problems");
    if ("problems" in p) expect(p.problems.join(" ")).toMatch(/already/i);
  });
});

