// Final review 2 (C1, I2, M3): two users on one order's trucks.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/gazoblok-stock", () => ({ applyGazoblokMovement: vi.fn() }));
vi.mock("@/lib/uploads", () => ({
  saveImageFromFormData: vi.fn(async () => ({ url: "/uploads/x.jpg" })),
  UploadError: class extends Error {},
}));

const order = [] as string[];
const tx = {
  $queryRaw: vi.fn(async () => {
    order.push("lock");
    return [];
  }),
  gazoblokOrder: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  gazoblokShipment: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(async () => {
      order.push("delete");
      return { count: 1 };
    }),
  },
  gazoblokStockMovement: { groupBy: vi.fn(async () => []) },
  gazoblokOrderEvent: { create: vi.fn() },
};
const prismaMock = {
  gazoblokShipment: { findFirst: vi.fn(), delete: vi.fn() },
  gazoblokOrder: { findUnique: vi.fn() },
  $transaction: (fn: (t: typeof tx) => unknown) => fn(tx),
};
vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return prismaMock;
  },
}));

import { getCurrentUser } from "@/lib/auth";
import { POST as LOAD } from "@/app/api/gazoblok/orders/[id]/shipments/[sid]/load/route";
import { PATCH as DELIVER, DELETE } from "@/app/api/gazoblok/orders/[id]/shipments/[sid]/route";
import { applyGazoblokMovement } from "@/lib/gazoblok-stock";

const owner = {
  id: "u1", email: "", name: "Admin", role: "ADMIN" as const, isActive: true, mustChangePassword: false,
  permissions: ["order.edit", "order.editShipped"],
};
const lines = [{ id: "A", productId: "pA", productLabel: "600×300×200", quantity: 2000, unitPrice: 18000 }];
const params = { params: { id: "o1", sid: "s2" } };
const url = (p: string) => new URL(`http://localhost/api/gazoblok/orders/o1/shipments/s2${p}`);

function loadReq(extra: Record<string, string> = {}) {
  const fd = new FormData();
  fd.append("loadedLines", JSON.stringify({ A: 400 }));
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  return new NextRequest(url("/load"), { method: "POST", body: fd });
}

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  vi.mocked(getCurrentUser).mockResolvedValue(owner);
  const o = {
    status: "IN_PRODUCTION", shortClosedAt: null,
    linesSubtotal: 36000000, discountAmount: 0, deliveryCost: 0, confirmedPaid: 0,
    lines, shipments: [],
  };
  prismaMock.gazoblokOrder.findUnique.mockResolvedValue(o);
  tx.gazoblokOrder.findUniqueOrThrow.mockResolvedValue(o);
  tx.gazoblokShipment.update.mockResolvedValue({ id: "s2" });
});

describe("DELETE an empty truck (C1)", () => {
  it("deletes only a PENDING truck of this order, under the order lock", async () => {
    const res = await DELETE(new NextRequest(url(""), { method: "DELETE" }), params);
    expect(res.status).toBe(200);
    expect(order).toEqual(["lock", "delete"]);
    expect(tx.gazoblokShipment.deleteMany).toHaveBeenCalledWith({ where: { id: "s2", orderId: "o1", status: "PENDING" } });
    expect(prismaMock.gazoblokShipment.delete).not.toHaveBeenCalled();
  });

  it("a truck another user just loaded is not deleted: 409", async () => {
    tx.gazoblokShipment.deleteMany.mockResolvedValueOnce({ count: 0 });
    tx.gazoblokShipment.findFirst.mockResolvedValueOnce({ id: "s2" });
    const res = await DELETE(new NextRequest(url(""), { method: "DELETE" }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Фақат бўш жўнатмани ўчириш мумкин/);
  });

  it("a truck that is already gone: 404", async () => {
    tx.gazoblokShipment.deleteMany.mockResolvedValueOnce({ count: 0 });
    tx.gazoblokShipment.findFirst.mockResolvedValueOnce(null);
    const res = await DELETE(new NextRequest(url(""), { method: "DELETE" }), params);
    expect(res.status).toBe(404);
  });
});

describe("fresh load of a truck someone else loaded (I2)", () => {
  it("expectPending=1 and the truck is LOADED under the lock → 409, nothing written", async () => {
    prismaMock.gazoblokShipment.findFirst.mockResolvedValue({ id: "s2", status: "PENDING", number: 2, loadedLines: null });
    tx.gazoblokShipment.findUnique.mockResolvedValue({ status: "LOADED", loadedLines: { A: 300 } });
    tx.gazoblokShipment.findUniqueOrThrow.mockResolvedValue({ status: "LOADED", loadedLines: { A: 300 } });
    const res = await LOAD(loadReq({ expectPending: "1" }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/^Бу жўнатма ҳозиргина юкланди — саҳифани янгиланг/);
    expect(applyGazoblokMovement).not.toHaveBeenCalled();
    expect(tx.gazoblokShipment.update).not.toHaveBeenCalled();
  });

  it("without expectPending (Android, corrections) a LOADED truck is still corrected", async () => {
    prismaMock.gazoblokShipment.findFirst.mockResolvedValue({ id: "s2", status: "LOADED", number: 2, loadedLines: { A: 300 } });
    tx.gazoblokShipment.findUnique.mockResolvedValue({ status: "LOADED", loadedLines: { A: 300 } });
    tx.gazoblokShipment.findUniqueOrThrow.mockResolvedValue({ status: "LOADED", loadedLines: { A: 300 } });
    const res = await LOAD(loadReq(), params);
    expect(res.status).toBe(200);
    expect(tx.gazoblokShipment.update).toHaveBeenCalled();
  });

  it("the truck was deleted by the other user's cleanup → 404, not a crash", async () => {
    prismaMock.gazoblokShipment.findFirst.mockResolvedValue({ id: "s2", status: "PENDING", number: 2, loadedLines: null });
    tx.gazoblokShipment.findUnique.mockResolvedValue(null);
    tx.gazoblokShipment.findUniqueOrThrow.mockRejectedValue(new Error("No record found"));
    const res = await LOAD(loadReq({ expectPending: "1" }), params);
    expect(res.status).toBe(404);
    expect(applyGazoblokMovement).not.toHaveBeenCalled();
  });
});

describe("deliver reads the lines under the lock (M3)", () => {
  it("labels in the history come from the in-transaction read", async () => {
    prismaMock.gazoblokShipment.findFirst.mockResolvedValue({ id: "s2", status: "LOADED", number: 2 });
    prismaMock.gazoblokOrder.findUnique.mockResolvedValue({
      status: "IN_PRODUCTION",
      lines: [{ id: "A", productLabel: "STALE", quantity: 2000 }],
    });
    tx.gazoblokOrder.findUniqueOrThrow.mockResolvedValue({
      status: "IN_PRODUCTION",
      lines: [{ id: "A", productLabel: "600×300×200", quantity: 2000 }],
    });
    tx.gazoblokShipment.updateMany.mockResolvedValue({ count: 1 });
    tx.gazoblokShipment.findUniqueOrThrow.mockResolvedValue({ id: "s2", loadedLines: { A: 400 } });
    const res = await DELIVER(new NextRequest(url(""), { method: "PATCH" }), params);
    expect(res.status).toBe(200);
    const e = tx.gazoblokOrderEvent.create.mock.calls.at(-1)?.[0]?.data;
    expect(e.payload.lines).toEqual([{ lineId: "A", label: "600×300×200", qty: 400 }]);
  });
});
