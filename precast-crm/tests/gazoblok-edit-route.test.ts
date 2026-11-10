import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));

const queryRaw = vi.fn();
const orderFindUnique = vi.fn();
const orderUpdate = vi.fn();
const lineUpdate = vi.fn();
const lineCreateMany = vi.fn();
const lineDeleteMany = vi.fn();
const lineFindMany = vi.fn();
const productFindMany = vi.fn();
const paymentAggregate = vi.fn();
const eventCreate = vi.fn();
const tx = {
  $queryRaw: (...a: unknown[]) => queryRaw(...a),
  gazoblokOrder: { findUnique: (...a: unknown[]) => orderFindUnique(...a), update: (...a: unknown[]) => orderUpdate(...a) },
  gazoblokOrderLine: {
    update: (...a: unknown[]) => lineUpdate(...a),
    createMany: (...a: unknown[]) => lineCreateMany(...a),
    deleteMany: (...a: unknown[]) => lineDeleteMany(...a),
    findMany: (...a: unknown[]) => lineFindMany(...a),
  },
  gazoblokProduct: { findMany: (...a: unknown[]) => productFindMany(...a) },
  gazoblokPayment: { aggregate: (...a: unknown[]) => paymentAggregate(...a) },
  gazoblokOrderEvent: { create: (...a: unknown[]) => eventCreate(...a) },
};
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (fn: (t: unknown) => unknown) => fn(tx) },
}));

import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { PATCH } from "@/app/api/gazoblok/orders/[id]/edit/route";

const operator = { id: "u1", email: "", name: "Op", role: "SALES" as const, permissions: ["order.edit"], isActive: true, mustChangePassword: false };
const owner = { ...operator, id: "u2", permissions: ["order.edit", "order.editShipped"] };

const dims = { lengthM: 0.6, heightM: 0.3, thicknessM: 0.2 };
// Fixture A: 600×300×200 ordered 200 @ 18 000, 168 loaded; delivery 300 000; total 3 900 000.
function order(over: Record<string, unknown> = {}) {
  return {
    id: "o1",
    orderNumber: "B-2026-11-0012",
    status: "IN_PRODUCTION",
    shortClosedAt: null,
    linesSubtotal: 3_600_000,
    discountPercent: 0,
    discountAmount: 0,
    deliveryCost: 300_000,
    overshipAmount: 0,
    totalPrice: 3_900_000,
    confirmedPaid: 1_000_000,
    scheduledAt: new Date(2026, 10, 12),
    notes: null,
    lines: [{ id: "A", productId: "pA", productLabel: "600×300×200", quantity: 200, unitPrice: 18_000, lineTotal: 3_600_000, product: dims }],
    shipments: [{ loadedLines: { A: 168 } }],
    ...over,
  };
}

const req = (body: unknown) =>
  new NextRequest(new URL("http://localhost/api/gazoblok/orders/o1/edit"), { method: "PATCH", body: JSON.stringify(body) });
const ctx = { params: { id: "o1" } };

beforeEach(() => {
  for (const f of [queryRaw, orderFindUnique, orderUpdate, lineUpdate, lineCreateMany, lineDeleteMany, lineFindMany, productFindMany, paymentAggregate, eventCreate]) f.mockReset();
  vi.mocked(recordAudit).mockReset();
  vi.mocked(getCurrentUser).mockResolvedValue(operator);
  orderFindUnique.mockResolvedValue(order());
  productFindMany.mockResolvedValue([]);
  paymentAggregate.mockResolvedValue({ _sum: { amount: 1_000_000 } });
  lineFindMany.mockResolvedValue([{ quantity: 250, product: dims }]);
});

describe("PATCH /api/gazoblok/orders/[id]/edit", () => {
  it("refuses a quantity edit by an operator after a truck was loaded, writing nothing", async () => {
    const res = await PATCH(req({ lines: [{ lineId: "A", productId: "pA", quantity: 250 }] }), ctx);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/эгаси/);
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("lets the same operator move the date after loading — ORDER_RESCHEDULED", async () => {
    const res = await PATCH(req({ scheduledAt: new Date(2026, 10, 14).toISOString() }), ctx);
    expect(res.status).toBe(200);
    const ev = eventCreate.mock.calls[0][0].data;
    expect(ev).toMatchObject({ orderId: "o1", type: "ORDER_RESCHEDULED", actorId: "u1", message: "Сана: 12.11.2026 → 14.11.2026" });
    expect(lineUpdate).not.toHaveBeenCalled();
    expect(orderUpdate.mock.calls[0][0].data.scheduledAt).toEqual(new Date(2026, 10, 14));
  });

  it("locks the order row before reading it", async () => {
    await PATCH(req({ scheduledAt: null }), ctx);
    expect(queryRaw).toHaveBeenCalled();
    expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(orderFindUnique.mock.invocationCallOrder[0]);
  });

  it("owner raises a line: frozen price, totals, volume, payment state, one ORDER_EDITED event, audit", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(owner);
    paymentAggregate.mockResolvedValue({ _sum: { amount: 4_800_000 } });
    const res = await PATCH(req({ lines: [{ lineId: "A", productId: "pA", quantity: 250 }] }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ id: "o1", totalPrice: 4_800_000, paymentState: "FULLY_PAID", refundDue: 0 });

    expect(lineUpdate).toHaveBeenCalledWith({ where: { id: "A" }, data: { quantity: 250, lineTotal: 4_500_000 } });
    const data = orderUpdate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      linesSubtotal: 4_500_000,
      totalPrice: 4_800_000,
      totalBlocks: 250,
      totalVolumeM3: 9,
      confirmedPaid: 4_800_000,
      paymentState: "FULLY_PAID",
    });
    expect(paymentAggregate.mock.calls[0][0].where).toEqual({ orderId: "o1", status: "CONFIRMED" });

    expect(eventCreate).toHaveBeenCalledTimes(1);
    const ev = eventCreate.mock.calls[0][0].data;
    expect(ev.type).toBe("ORDER_EDITED");
    expect(ev.actorId).toBe("u2");
    expect(ev.message).toMatch(/^600×300×200: 200 → 250 та; Жами: 3\s900\s000 → 4\s800\s000 UZS$/);
    expect(ev.payload.before.totalPrice).toBe(3_900_000);
    expect(ev.payload.after.totalPrice).toBe(4_800_000);
    expect(ev.payload.changes).toHaveLength(2);
    expect(vi.mocked(recordAudit).mock.calls[0][0]).toMatchObject({ userId: "u2", action: "gazoblok.order.edit", targetId: "o1" });
  });

  it("lowering below confirmed money reports the refund due", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(owner);
    orderFindUnique.mockResolvedValue(order({ shipments: [] }));
    paymentAggregate.mockResolvedValue({ _sum: { amount: 3_900_000 } });
    lineFindMany.mockResolvedValue([{ quantity: 100, product: dims }]);
    const res = await PATCH(req({ lines: [{ lineId: "A", productId: "pA", quantity: 100 }] }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ id: "o1", totalPrice: 2_100_000, paymentState: "FULLY_PAID", refundDue: 1_800_000 });
  });

  it("prices a new size from the catalog, archived sizes refused", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(owner);
    productFindMany.mockResolvedValue([{ id: "pB", label: "600×300×300", pricePerBlock: 25_000, active: false, ...dims }]);
    const res = await PATCH(req({ lines: [{ lineId: "A", productId: "pA", quantity: 200 }, { productId: "pB", quantity: 10 }] }), ctx);
    expect(res.status).toBe(422);
    expect(productFindMany.mock.calls[0][0].where).toEqual({ id: { in: ["pB"] } });
    expect(lineCreateMany).not.toHaveBeenCalled();
  });

  it("refuses closed orders, unknown orders and users without order.edit", async () => {
    orderFindUnique.mockResolvedValue(order({ status: "DELIVERED" }));
    expect((await PATCH(req({ notes: "x" }), ctx)).status).toBe(409);
    orderFindUnique.mockResolvedValue(null);
    expect((await PATCH(req({ notes: "x" }), ctx)).status).toBe(404);
    orderFindUnique.mockResolvedValue(order());
    vi.mocked(getCurrentUser).mockResolvedValue({ ...operator, permissions: [] });
    expect((await PATCH(req({ notes: "x" }), ctx)).status).toBe(403);
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("rejects an empty body (ZodError → 422, project convention)", async () => {
    expect((await PATCH(req({}), ctx)).status).toBe(422);
  });
});
