import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
const emitNotifications = vi.fn();
vi.mock("@/lib/notifications", () => ({
  emitNotifications: (...a: unknown[]) => emitNotifications(...a),
  usersWithPermission: vi.fn(async () => ["owner"]),
}));

const productFindMany = vi.fn();
const clientFindUnique = vi.fn();
const paymentFindFirst = vi.fn();
const tx = {
  client: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  gazoblokOrder: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  gazoblokPayment: { create: vi.fn() },
  gazoblokOrderEvent: { create: vi.fn() },
  gazoblokReceipt: { createMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    gazoblokProduct: { findMany: (...a: unknown[]) => productFindMany(...a) },
    client: { findUnique: (...a: unknown[]) => clientFindUnique(...a) },
    gazoblokOrder: { findUnique: vi.fn() },
    gazoblokPayment: { findFirst: (...a: unknown[]) => paymentFindFirst(...a) },
    $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

import { getCurrentUser } from "@/lib/auth";
import { POST } from "@/app/api/gazoblok/orders/route";

const base = { id: "u1", email: "", name: "Op", role: "SALES" as const, isActive: true, mustChangePassword: false };
const owner = { ...base, permissions: ["order.create", "payment.record", "payment.confirm"] };
const operator = { ...base, permissions: ["order.create", "payment.record"] };
const seller = { ...base, permissions: ["order.create"] };

const receipt = "/uploads/receipts/gazoblok/u1/abc.jpg";
const body = (extra: Record<string, unknown> = {}) => ({
  clientName: "Шерзод",
  clientPhone: "+998 90 111 22 33",
  lines: [{ productId: "p1", quantity: 100 }],
  ...extra,
});
const req = (json: unknown) =>
  new NextRequest(new URL("http://localhost/api/gazoblok/orders"), {
    method: "POST",
    body: JSON.stringify(json),
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  productFindMany.mockResolvedValue([
    { id: "p1", label: "600×300×200", pricePerBlock: 18_000, lengthM: 0.6, heightM: 0.3, thicknessM: 0.2, active: true },
  ]);
  clientFindUnique.mockResolvedValue(null);
  paymentFindFirst.mockResolvedValue(null);
  tx.client.findUnique.mockResolvedValue(null);
  tx.client.create.mockResolvedValue({ id: "c1", name: "Шерзод", address: null });
  tx.gazoblokOrder.findFirst.mockResolvedValue(null);
  tx.gazoblokOrder.create.mockResolvedValue({ id: "o1", orderNumber: "B-2026-11-0001", client: { name: "Шерзод" }, lines: [] });
  tx.gazoblokOrder.update.mockResolvedValue({ id: "o1", orderNumber: "B-2026-11-0001", client: { name: "Шерзод" }, lines: [] });
  tx.gazoblokPayment.create.mockResolvedValue({ id: "pay1" });
});

describe("POST /api/gazoblok/orders — receipt photo with the placement payment", () => {
  it("a confirmer's payment lands confirmed with its receipts linked", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(owner);
    const res = await POST(req(body({ paidAmount: 500_000, paymentMethod: "CASH", receiptUrls: [receipt] })), { params: {} });
    expect(res.status).toBe(201);
    expect(tx.gazoblokPayment.create.mock.calls[0][0].data.status).toBe("CONFIRMED");
    expect(tx.gazoblokReceipt.createMany).toHaveBeenCalledWith({
      data: [{ orderId: "o1", paymentId: "pay1", imageUrl: receipt, source: "CRM_UPLOAD", uploadedById: "u1" }],
    });
  });

  it("an operator's payment waits for confirmation, receipts still linked", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(operator);
    const res = await POST(req(body({ paidAmount: 500_000, paymentMethod: "CLICK", receiptUrls: [receipt] })), { params: {} });
    expect(res.status).toBe(201);
    expect(tx.gazoblokPayment.create.mock.calls[0][0].data.status).toBe("PENDING_CONFIRMATION");
    expect(tx.gazoblokReceipt.createMany.mock.calls[0][0].data[0].paymentId).toBe("pay1");
    expect(tx.gazoblokOrder.update).not.toHaveBeenCalled();
  });

  it("no receipts → nothing written to receipts (unchanged placement)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(owner);
    const res = await POST(req(body({ paidAmount: 500_000, paymentMethod: "CASH" })), { params: {} });
    expect(res.status).toBe(201);
    expect(tx.gazoblokReceipt.createMany).not.toHaveBeenCalled();
  });

  it("a receipt without a payment is refused", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(owner);
    const res = await POST(req(body({ receiptUrls: [receipt] })), { params: {} });
    expect(res.status).toBe(422);
    expect(tx.gazoblokOrder.create).not.toHaveBeenCalled();
  });

  it("a receipt URL outside the gazoblok receipts folder is refused", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(owner);
    for (const bad of ["/uploads/other/x.jpg", "/uploads/receipts/gazoblok/../../etc.jpg", "https://evil/x.jpg"]) {
      const res = await POST(req(body({ paidAmount: 1000, paymentMethod: "CASH", receiptUrls: [bad] })), { params: {} });
      expect(res.status).toBe(422);
    }
    expect(tx.gazoblokOrder.create).not.toHaveBeenCalled();
  });

  it("attaching a receipt needs payment.record", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(seller);
    const res = await POST(req(body({ paidAmount: 1000, paymentMethod: "CASH", receiptUrls: [receipt] })), { params: {} });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/Тўлов ёзишга рухсат йўқ/);
    expect(tx.gazoblokOrder.create).not.toHaveBeenCalled();
  });

  it("a pending payment still rings the confirmers after commit", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(operator);
    paymentFindFirst.mockResolvedValue({ id: "pay1", amount: 500_000, method: "CLICK" });
    await POST(req(body({ paidAmount: 500_000, paymentMethod: "CLICK", receiptUrls: [receipt] })), { params: {} });
    await vi.waitFor(() => expect(emitNotifications).toHaveBeenCalledTimes(2));
  });

  it("the placement history names every size with its count and price; the advance its method and receipts", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(owner);
    await POST(req(body({ paidAmount: 500_000, paymentMethod: "CLICK", receiptUrls: [receipt] })), { params: {} });
    const placed = tx.gazoblokOrder.create.mock.calls[0][0].data.events.create;
    expect(placed.payload.lines).toEqual([{ label: "600×300×200", qty: 100, unitPrice: 18_000 }]);
    const rec = tx.gazoblokOrderEvent.create.mock.calls[0][0].data;
    expect(rec.type).toBe("PAYMENT_RECORDED");
    expect(rec.payload).toMatchObject({ paymentId: "pay1", amount: 500_000, method: "CLICK", receipts: 1, atPlacement: true });
    expect(rec.message.replace(/[  ]/g, " ")).toBe("Тўлов ёзилди: 500 000 UZS · Click · чек 1 та");
    const conf = tx.gazoblokOrderEvent.create.mock.calls[1][0].data;
    expect(conf.payload).toMatchObject({ paymentId: "pay1", method: "CLICK", autoConfirmed: true });
  });
});
