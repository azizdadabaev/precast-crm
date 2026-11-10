import { describe, it, expect } from "vitest";
import {
  monthlySeries,
  receivablesOf,
  overloadByOperator,
  stockRows,
  truckRows,
  dayPlan,
  clientGazoblokSummary,
  type MoneyOrderRow,
  type OpenOrderRow,
} from "@/lib/gazoblok-dashboard";
import { blockWeightKg } from "@/lib/gazoblok-weight";

const NOW = new Date(2026, 10, 10, 12, 0); // 2026-11-10 12:00 local
const DIMS = { lengthM: 0.6, heightM: 0.3, thicknessM: 0.2 };

function moneyRow(over: Partial<MoneyOrderRow>): MoneyOrderRow {
  return {
    id: "o1",
    orderNumber: "B-2026-11-0001",
    totalPrice: 5_000_000,
    confirmedPaid: 0,
    overshipAmount: 0,
    createdById: "u1",
    createdByName: "Тест Оператор",
    clientName: "Мижоз",
    lines: [
      { id: "A", productId: "pA", productLabel: "600×300×200", quantity: 200 },
      { id: "B", productId: "pB", productLabel: "600×300×300", quantity: 100 },
    ],
    shipments: [],
    ...over,
  };
}

function openRow(over: Partial<OpenOrderRow>): OpenOrderRow {
  return {
    id: "o1",
    orderNumber: "B-2026-11-0001",
    clientName: "Мижоз",
    scheduledAt: null,
    shortClosedAt: null,
    lines: [{ id: "A", productId: "pA", productLabel: "600×300×200", quantity: 432, product: DIMS }],
    shipments: [],
    ...over,
  };
}

describe("monthlySeries", () => {
  const months = monthlySeries(
    NOW,
    [
      { placedAt: new Date(2026, 10, 3, 10), totalPrice: 5_000_000, totalBlocks: 300, totalVolumeM3: 9.72 },
      { placedAt: new Date(2025, 9, 31, 10), totalPrice: 7_000_000, totalBlocks: 100, totalVolumeM3: 3 },
    ],
    [
      { amount: 3_000_000, confirmedAt: new Date(2026, 10, 5, 9) },
      { amount: -500_000, confirmedAt: new Date(2026, 10, 7, 9) },
      { amount: 9_000_000, confirmedAt: null },
    ],
  );

  it("returns 12 months ending in the current one", () => {
    expect(months).toHaveLength(12);
    expect(months[11]!.key).toBe("2026-11");
    expect(months[0]!.key).toBe("2025-12");
  });

  it("books orders in their placed month and drops those outside the window", () => {
    const nov = months[11]!;
    expect(nov).toMatchObject({ booked: 5_000_000, orders: 1, blocks: 300, volumeM3: 9.72, year: 2026 });
    expect(months.reduce((s, m) => s + m.orders, 0)).toBe(1);
  });

  it("nets refunds into collected and ignores unconfirmed payments", () => {
    expect(months[11]!.collected).toBe(2_500_000);
    expect(months.reduce((s, m) => s + m.collected, 0)).toBe(2_500_000);
  });
});

describe("receivablesOf", () => {
  it("sums what is still owed; overpaid counts 0", () => {
    expect(
      receivablesOf([
        { totalPrice: 5e6, confirmedPaid: 3e6 },
        { totalPrice: 1e6, confirmedPaid: 1e6 },
        { totalPrice: 2e6, confirmedPaid: 2.5e6 },
      ]),
    ).toEqual({ total: 2_000_000, orders: 1 });
  });
});

describe("overloadByOperator", () => {
  it("unpaid over-load is the last money in", () => {
    const partly = overloadByOperator([moneyRow({ overshipAmount: 900_000, confirmedPaid: 4_500_000 })]);
    expect(partly.total).toBe(500_000);
    expect(partly.operators[0]!.orders[0]!.unpaid).toBe(500_000);

    const paid = overloadByOperator([moneyRow({ overshipAmount: 900_000, confirmedPaid: 5_000_000 })]);
    expect(paid).toEqual({ total: 0, extraBlocks: 0, orders: 0, operators: [] });
  });

  it("groups legacy orders under null operator", () => {
    const loaded232 = [{ loadedLines: { A: 140 } }, { loadedLines: { A: 92, B: 50 } }];
    const res = overloadByOperator([
      moneyRow({ id: "o1", orderNumber: "B-1", overshipAmount: 576_000, confirmedPaid: 0, shipments: loaded232 }),
      moneyRow({ id: "o2", orderNumber: "B-2", overshipAmount: 200_000, confirmedPaid: 0, shipments: [{ loadedLines: { B: 110 } }] }),
      moneyRow({
        id: "o3",
        orderNumber: "B-3",
        overshipAmount: 300_000,
        confirmedPaid: 0,
        createdById: null,
        createdByName: null,
        shipments: [{ loadedLines: { A: 215 } }],
      }),
    ]);
    expect(res.operators.map((o) => o.operatorId)).toEqual(["u1", null]);
    const u1 = res.operators[0]!;
    expect(u1).toMatchObject({ name: "Тест Оператор", unpaid: 776_000, extraBlocks: 42 });
    expect(u1.orders.map((o) => [o.orderNumber, o.extraBlocks, o.unpaid])).toEqual([
      ["B-1", 32, 576_000],
      ["B-2", 10, 200_000],
    ]);
    expect(res.operators[1]).toMatchObject({ name: null, unpaid: 300_000, extraBlocks: 15 });
    expect(res).toMatchObject({ total: 1_076_000, extraBlocks: 57, orders: 3 });
  });
});

describe("stockRows", () => {
  const products = [
    { id: "pA", label: "600×300×200", lowStockThreshold: 50, onHand: 1240 },
    { id: "pB", label: "600×300×300", lowStockThreshold: 50, onHand: 180 },
    { id: "pC", label: "600×300×100", lowStockThreshold: 50, onHand: 0 },
    { id: "pD", label: "600×300×250", lowStockThreshold: 10, onHand: 20 },
  ];
  const open = [
    openRow({ id: "o1" }),
    openRow({
      id: "o2",
      lines: [
        { id: "B", productId: "pB", productLabel: "600×300×300", quantity: 200, product: DIMS },
        { id: "D", productId: "pD", productLabel: "600×300×250", quantity: 90, product: DIMS },
      ],
      shipments: [
        { id: "s1", number: 1, status: "LOADED", loadedLines: { B: 50 }, loadedAt: NOW, deliveredAt: null },
      ],
    }),
  ];

  it("reserves what open orders still need and grades the free stock", () => {
    const rows = stockRows(products, open);
    expect(rows.map((r) => r.productId)).toEqual(["pA", "pB", "pC", "pD"]);
    expect(rows[0]).toEqual({ productId: "pA", label: "600×300×200", onHand: 1240, reserved: 432, free: 808, state: "ok" });
    expect(rows[1]).toMatchObject({ onHand: 180, reserved: 150, free: 30, state: "low" });
    expect(rows[2]).toMatchObject({ onHand: 0, reserved: 0, free: 0, state: "out" });
    expect(rows[3]).toMatchObject({ onHand: 20, reserved: 90, free: 0, state: "low" });
  });

  it("short-closed orders reserve nothing", () => {
    const closed = openRow({ id: "o1", scheduledAt: new Date(2026, 10, 10, 9), shortClosedAt: new Date(2026, 10, 9) });
    expect(stockRows(products.slice(0, 1), [closed])[0]).toMatchObject({ reserved: 0, free: 1240 });
    expect(dayPlan(NOW, [closed]).plan[0]!.orders[0]!.blocksLeft).toBe(0);
  });
});

describe("truckRows", () => {
  const lines = [{ id: "A", productId: "pA", productLabel: "600×300×200", quantity: 200, product: DIMS }];
  const overLoaded = openRow({
    id: "o1",
    orderNumber: "B-1",
    lines,
    shipments: [
      { id: "s1", number: 1, status: "DELIVERED", loadedLines: { A: 92 }, loadedAt: new Date(2026, 10, 8, 9), deliveredAt: new Date(2026, 10, 8, 15) },
      { id: "s2", number: 2, status: "LOADED", loadedLines: { A: 140 }, loadedAt: new Date(2026, 10, 10, 8, 50), deliveredAt: null },
    ],
  });
  const pending = openRow({
    id: "o2",
    orderNumber: "B-2",
    lines,
    shipments: [{ id: "s3", number: 1, status: "PENDING", loadedLines: null, loadedAt: null, deliveredAt: null }],
  });
  const finished = openRow({
    id: "o3",
    orderNumber: "B-3",
    lines,
    shipments: [
      { id: "s4", number: 1, status: "DELIVERED", loadedLines: { A: 100 }, loadedAt: new Date(2026, 10, 9, 16), deliveredAt: new Date(2026, 10, 9, 18) },
      { id: "s5", number: 2, status: "DELIVERED", loadedLines: { A: 100 }, loadedAt: new Date(2026, 10, 10, 7), deliveredAt: new Date(2026, 10, 10, 7, 40) },
    ],
  });
  const rows = truckRows(NOW, [overLoaded, pending], [finished]);

  it("lists loaded, then pending, then delivered today", () => {
    expect(rows.map((r) => [r.shipmentId, r.status])).toEqual([
      ["s2", "LOADED"],
      ["s3", "PENDING"],
      ["s5", "DELIVERED"],
    ]);
  });

  it("counts blocks, weight and the order's over-load", () => {
    expect(rows[0]).toMatchObject({
      orderId: "o1",
      orderNumber: "B-1",
      clientName: "Мижоз",
      number: 2,
      blocks: 140,
      weightKg: Math.round(140 * blockWeightKg(0.6, 0.3, 0.2)),
      overBlocks: 32,
      at: new Date(2026, 10, 10, 8, 50).toISOString(),
    });
    expect(rows[1]).toMatchObject({ blocks: 0, weightKg: 0, overBlocks: 0, at: null });
    expect(rows[2]).toMatchObject({ blocks: 100, overBlocks: 0, at: new Date(2026, 10, 10, 7, 40).toISOString() });
  });

  it("weighs 0 when the product was deleted", () => {
    const gone = openRow({
      lines: [{ id: "A", productId: null, productLabel: "600×300×200", quantity: 200, product: null }],
      shipments: [{ id: "s9", number: 1, status: "LOADED", loadedLines: { A: 10 }, loadedAt: NOW, deliveredAt: null }],
    });
    expect(truckRows(NOW, [gone], [])[0]).toMatchObject({ blocks: 10, weightKg: 0 });
  });
});

describe("dayPlan", () => {
  it("keeps today … today+6 and counts unscheduled open orders", () => {
    const res = dayPlan(NOW, [
      openRow({ id: "a", scheduledAt: new Date(2026, 10, 10, 0, 0) }),
      openRow({ id: "b", scheduledAt: new Date(2026, 10, 16, 23, 0) }),
      openRow({ id: "c", scheduledAt: new Date(2026, 10, 17, 0, 0) }),
      openRow({ id: "d", scheduledAt: null }),
    ]);
    expect(res.plan.map((d) => d.date)).toEqual(["2026-11-10", "2026-11-16"]);
    expect(res.plan[0]!.orders[0]).toEqual({ id: "a", orderNumber: "B-2026-11-0001", clientName: "Мижоз", blocksLeft: 432 });
    expect(res.unscheduledOpen).toBe(1);
  });
});

describe("clientGazoblokSummary", () => {
  it("counts every order but books and owes only live ones", () => {
    expect(
      clientGazoblokSummary([
        { status: "PLACED", totalPrice: 5e6, confirmedPaid: 3e6 },
        { status: "CANCELED", totalPrice: 1e6, confirmedPaid: 0 },
        { status: "DELIVERED", totalPrice: 2e6, confirmedPaid: 2e6 },
      ]),
    ).toEqual({ orderCount: 3, totalBooked: 7_000_000, debt: 2_000_000 });
  });
});
