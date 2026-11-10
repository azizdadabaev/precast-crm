// Routes write structured history payloads: sizes + counts, running totals, money + method.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/gazoblok-stock", () => ({ applyGazoblokMovement: vi.fn() }));
vi.mock("@/lib/uploads", () => ({
  saveImageFromFormData: vi.fn(async () => ({ url: "/uploads/x.jpg" })),
  UploadError: class extends Error {},
}));
const emitNotifications = vi.fn(async () => undefined);
vi.mock("@/lib/notifications", () => ({
  emitNotifications: (...a: unknown[]) => emitNotifications(...(a as [])),
  usersWithPermission: vi.fn(async () => ["owner"]),
}));

const eventCreate = vi.fn();
const tx = {
  $queryRaw: vi.fn(),
  gazoblokOrder: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  gazoblokShipment: { findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  gazoblokStockMovement: { groupBy: vi.fn() },
  gazoblokOrderEvent: { create: (...a: unknown[]) => eventCreate(...a) },
  gazoblokPayment: { aggregate: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  gazoblokReceipt: { createMany: vi.fn() },
};
const prismaMock = {
  gazoblokShipment: { findFirst: vi.fn() },
  gazoblokOrder: { findUnique: vi.fn() },
  gazoblokPayment: { findUnique: vi.fn() },
  $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
};
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return prismaMock;
  },
}));

import { getCurrentUser } from "@/lib/auth";
import { POST as LOAD } from "@/app/api/gazoblok/orders/[id]/shipments/[sid]/load/route";
import { PATCH as DELIVER } from "@/app/api/gazoblok/orders/[id]/shipments/[sid]/route";
import { PATCH as ACTION } from "@/app/api/gazoblok/orders/[id]/route";

const N = (s: string) => s.replace(/[  ]/g, " ");
const owner = {
  id: "u1", email: "", name: "Admin", role: "ADMIN" as const, isActive: true, mustChangePassword: false,
  permissions: ["order.edit", "order.editShipped", "payment.record", "payment.confirm"],
};
const operator = { ...owner, id: "u2", name: "Op", permissions: ["order.edit", "payment.record"] };

const lines = [
  { id: "A", productId: "pA", productLabel: "600×300×200", quantity: 2000, unitPrice: 18000 },
  { id: "B", productId: "pB", productLabel: "600×300×300", quantity: 40, unitPrice: 27000 },
];

function loadReq(loaded: Record<string, number>, extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.append("loadedLines", JSON.stringify(loaded));
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return new NextRequest(new URL("http://localhost/api/gazoblok/orders/o1/shipments/s2/load"), { method: "POST", body: fd });
}
const jsonReq = (body: unknown) =>
  new NextRequest(new URL("http://localhost/api/gazoblok/orders/o1"), {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
const lastEvent = () => eventCreate.mock.calls.at(-1)?.[0]?.data;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue(owner);
});

describe("load route payload", () => {
  beforeEach(() => {
    const order = {
      status: "IN_PRODUCTION", shortClosedAt: null,
      linesSubtotal: 37080000, discountAmount: 0, deliveryCost: 200000, confirmedPaid: 10000000,
      lines,
      shipments: [{ loadedLines: { A: 500, B: 40 } }],
    };
    prismaMock.gazoblokOrder.findUnique.mockResolvedValue(order);
    tx.gazoblokOrder.findUniqueOrThrow.mockResolvedValue(order);
    tx.gazoblokStockMovement.groupBy.mockResolvedValue([]);
    tx.gazoblokShipment.update.mockResolvedValue({ id: "s2" });
  });

  it("first load: sizes, truck total, running loaded / left, photos; legacy keys kept", async () => {
    prismaMock.gazoblokShipment.findFirst.mockResolvedValue({ id: "s2", status: "PENDING", number: 2, loadedLines: null });
    tx.gazoblokShipment.findUniqueOrThrow.mockResolvedValue({ status: "PENDING", loadedLines: null });
    const res = await LOAD(loadReq({ A: 400 }), { params: { id: "o1", sid: "s2" } });
    expect(res.status).toBe(200);
    const e = lastEvent();
    expect(e.type).toBe("SHIPMENT_LOADED");
    expect(e.payload).toMatchObject({
      shipmentId: "s2", number: 2, loadedLines: { A: 400 },
      lines: [{ lineId: "A", label: "600×300×200", qty: 400 }],
      truckTotal: 400, orderedTotal: 2040, loadedTotal: 940, leftTotal: 1100, overTotal: 0, photos: 0,
    });
    expect(N(e.message)).toBe("Жўнатма 2 юкланди: 600×300×200 — 400 та (ҳаммаси 400 та). Юкланди 940 / 2 040, қолди 1 100 та.");
  });

  it("correction: changed sizes with before, truck total before → after", async () => {
    prismaMock.gazoblokShipment.findFirst.mockResolvedValue({ id: "s2", status: "LOADED", number: 2, loadedLines: { A: 400 } });
    tx.gazoblokShipment.findUniqueOrThrow.mockResolvedValue({ status: "LOADED", loadedLines: { A: 400 } });
    tx.gazoblokStockMovement.groupBy.mockResolvedValue([{ productId: "pA", _sum: { change: -400 } }]);
    await LOAD(loadReq({ A: 380 }), { params: { id: "o1", sid: "s2" } });
    const e = lastEvent();
    expect(e.type).toBe("SHIPMENT_CORRECTED");
    expect(e.payload).toMatchObject({
      before: { A: 400 },
      lines: [{ lineId: "A", label: "600×300×200", qty: 380, before: 400 }],
      truckTotal: 380, truckTotalBefore: 400, loadedTotal: 920, leftTotal: 1120,
    });
    expect(N(e.message)).toContain("600×300×200 400 → 380 та (−20)");
  });

  it("confirmed over-load: extra blocks + money in the payload and message", async () => {
    prismaMock.gazoblokShipment.findFirst.mockResolvedValue({ id: "s2", status: "PENDING", number: 2, loadedLines: null });
    tx.gazoblokShipment.findUniqueOrThrow.mockResolvedValue({ status: "PENDING", loadedLines: null });
    await LOAD(loadReq({ A: 1580 }, { confirmOverload: "true" }), { params: { id: "o1", sid: "s2" } });
    const e = lastEvent();
    expect(e.payload).toMatchObject({ overloadConfirmed: true, overBlocks: 80, overshipDelta: 1440000, overTotal: 80 });
    expect(N(e.message)).toContain("Буюртмадан ортиқ +80 та · +1 440 000 UZS.");
  });
});

describe("deliver route payload", () => {
  it("copies the truck's sizes with labels and the delivered total", async () => {
    prismaMock.gazoblokShipment.findFirst.mockResolvedValue({ id: "s1", status: "LOADED", number: 1 });
    prismaMock.gazoblokOrder.findUnique.mockResolvedValue({ status: "IN_PRODUCTION", lines });
    tx.gazoblokShipment.updateMany.mockResolvedValue({ count: 1 });
    tx.gazoblokShipment.findUniqueOrThrow.mockResolvedValue({ id: "s1", loadedLines: { B: 40, A: 500 } });
    const res = await DELIVER(jsonReq({}), { params: { id: "o1", sid: "s1" } });
    expect(res.status).toBe(200);
    const e = lastEvent();
    expect(e.payload).toEqual({
      shipmentId: "s1", number: 1,
      lines: [{ lineId: "A", label: "600×300×200", qty: 500 }, { lineId: "B", label: "600×300×300", qty: 40 }],
      deliveredTotal: 540,
    });
    expect(N(e.message)).toBe("Жўнатма 1 етказилди: 600×300×200 — 500 та, 600×300×300 — 40 та (540 та).");
  });
});

describe("order PATCH payloads", () => {
  const order = {
    id: "o1", orderNumber: "B-1", status: "IN_PRODUCTION", shortClosedAt: null,
    totalPrice: 1800000, confirmedPaid: 0, lines,
  };
  beforeEach(() => {
    prismaMock.gazoblokOrder.findUnique.mockResolvedValue(order);
    tx.gazoblokOrder.findUniqueOrThrow.mockResolvedValue({ status: "IN_PRODUCTION", totalPrice: 1800000, confirmedPaid: 0 });
    tx.gazoblokPayment.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    tx.gazoblokPayment.create.mockResolvedValue({ id: "pay1" });
    tx.gazoblokOrder.update.mockResolvedValue(order);
  });

  it("record_payment: method + receipts on the recorded row; auto-confirm row carries method too", async () => {
    await ACTION(jsonReq({ action: "record_payment", amount: 500000, method: "CLICK", receiptUrls: ["/uploads/receipts/gazoblok/u1/a.jpg"] }), { params: { id: "o1" } });
    const [rec, conf] = eventCreate.mock.calls.map((c) => c[0].data);
    expect(rec.payload).toEqual({ paymentId: "pay1", amount: 500000, method: "CLICK", receipts: 1 });
    expect(N(rec.message)).toBe("Тўлов ёзилди: 500 000 UZS · Click · чек 1 та");
    expect(conf.payload).toEqual({ paymentId: "pay1", amount: 500000, method: "CLICK", autoConfirmed: true });
  });

  it("an operator's payment logs once and still rings the confirmers", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(operator);
    await ACTION(jsonReq({ action: "record_payment", amount: 500000, method: "CASH" }), { params: { id: "o1" } });
    expect(eventCreate).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(emitNotifications).toHaveBeenCalled();
  });

  it("confirm_payment: amount, method and recorder", async () => {
    prismaMock.gazoblokPayment.findUnique.mockResolvedValue({
      id: "pay1", orderId: "o1", status: "PENDING_CONFIRMATION", amount: 1000000, method: "CLICK", notes: null,
      recordedById: "u2", recordedBy: { name: "Op" },
    });
    tx.gazoblokPayment.updateMany.mockResolvedValue({ count: 1 });
    tx.gazoblokPayment.aggregate.mockResolvedValue({ _sum: { amount: 1000000 } });
    await ACTION(jsonReq({ action: "confirm_payment", paymentId: "pay1", approve: true }), { params: { id: "o1" } });
    const ev = tx.gazoblokOrder.update.mock.calls.at(-1)?.[0]?.data?.events?.create;
    expect(ev.payload).toEqual({ paymentId: "pay1", amount: 1000000, method: "CLICK", recordedBy: "Op" });
    expect(N(ev.message)).toBe("Тўлов тасдиқланди: 1 000 000 UZS · Click (ёзган: Op)");
  });

  it("reject: reason in payload and message", async () => {
    prismaMock.gazoblokPayment.findUnique.mockResolvedValue({
      id: "pay1", orderId: "o1", status: "PENDING_CONFIRMATION", amount: 1000000, method: "CASH", notes: null,
      recordedById: "u2", recordedBy: { name: "Op" },
    });
    tx.gazoblokPayment.updateMany.mockResolvedValue({ count: 1 });
    await ACTION(jsonReq({ action: "confirm_payment", paymentId: "pay1", approve: false, rejectionReason: "Пул тушмаган" }), { params: { id: "o1" } });
    const ev = tx.gazoblokOrder.update.mock.calls.at(-1)?.[0]?.data?.events?.create;
    expect(ev.type).toBe("PAYMENT_REJECTED");
    expect(ev.payload).toEqual({ paymentId: "pay1", amount: 1000000, method: "CASH", recordedBy: "Op", reason: "Пул тушмаган" });
    expect(N(ev.message)).toBe("Тўлов рад этилди: 1 000 000 UZS · Нақд — сабаб: Пул тушмаган");
  });

  it("close_short: not taken per size, totals, refund owed, reason", async () => {
    tx.gazoblokOrder.findUniqueOrThrow.mockResolvedValue({
      status: "IN_PRODUCTION", shortClosedAt: null, totalPrice: 1800000, linesSubtotal: 1800000, discountAmount: 0, deliveryCost: 0,
      lines: [{ id: "A", productId: "pA", productLabel: "600×300×200", quantity: 100, unitPrice: 18000, product: null }],
      shipments: [{ loadedLines: { A: 60 } }],
    });
    tx.gazoblokPayment.aggregate.mockResolvedValue({ _sum: { amount: 1800000 } });
    const res = await ACTION(jsonReq({ action: "close_short", reason: "Мижоз олмайди" }), { params: { id: "o1" } });
    expect(res.status).toBe(200);
    const e = lastEvent();
    expect(e.type).toBe("ORDER_SHORT_CLOSED");
    expect(e.payload).toMatchObject({
      reason: "Мижоз олмайди",
      before: { totalPrice: 1800000 },
      after: { totalPrice: 1080000 },
      quantities: [{ label: "600×300×200", ordered: 100, loaded: 60 }],
      notTakenTotal: 40,
      refundDue: 720000,
    });
    expect(N(e.message)).toBe(
      "Юкланганича ёпилди: 600×300×200 — 60 / 100 та (40 та олинмади). Жами 1 800 000 → 1 080 000 UZS. Қайтариш керак 720 000 UZS. Сабаб: Мижоз олмайди",
    );
  });
});
