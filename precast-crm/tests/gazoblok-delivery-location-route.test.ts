import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/audit", () => ({ recordAudit: vi.fn() }));
const queryRaw = vi.fn();
const orderFindUnique = vi.fn();
const orderUpdate = vi.fn();
const eventCreate = vi.fn();
const tx = {
  $queryRaw: (...a: unknown[]) => queryRaw(...a),
  gazoblokOrder: { findUnique: (...a: unknown[]) => orderFindUnique(...a), update: (...a: unknown[]) => orderUpdate(...a) },
  gazoblokOrderEvent: { create: (...a: unknown[]) => eventCreate(...a) },
};
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: (fn: (t: unknown) => unknown) => fn(tx) },
}));

import { getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { PATCH } from "@/app/api/gazoblok/orders/[id]/delivery-location/route";

const user = { id: "u1", email: "", name: "Op", role: "SALES" as const, permissions: ["order.edit"], isActive: true, mustChangePassword: false };
const req = (body: unknown) =>
  new NextRequest(new URL("http://localhost/api/gazoblok/orders/o1/delivery-location"), { method: "PATCH", body: JSON.stringify(body) });
const ctx = { params: { id: "o1" } };
const pinned = (data: Record<string, unknown>) => ({ id: "o1", ...data });

beforeEach(() => {
  for (const f of [queryRaw, orderFindUnique, orderUpdate, eventCreate]) f.mockReset();
  vi.mocked(recordAudit).mockReset();
  vi.mocked(getCurrentUser).mockResolvedValue(user);
  orderFindUnique.mockResolvedValue({ id: "o1", orderNumber: "B-2026-11-0012", status: "PLACED", shortClosedAt: null });
  orderUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => pinned(data));
});

describe("PATCH /api/gazoblok/orders/[id]/delivery-location", () => {
  it("sets the pin under the row lock and logs DELIVERY_LOCATION_SET", async () => {
    const res = await PATCH(req({ lat: 40.6, lng: 72.4, url: "https://maps.google.com/?q=40.6,72.4", label: "Кўк дарвоза" }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      id: "o1",
      deliveryLat: 40.6,
      deliveryLng: 72.4,
      deliveryLocationUrl: "https://maps.google.com/?q=40.6,72.4",
      deliveryLocationLabel: "Кўк дарвоза",
    });
    expect(queryRaw.mock.invocationCallOrder[0]).toBeLessThan(orderFindUnique.mock.invocationCallOrder[0]);
    expect(eventCreate.mock.calls[0][0].data).toMatchObject({
      orderId: "o1",
      type: "DELIVERY_LOCATION_SET",
      actorId: "u1",
      message: "Манзил белгиланди: Кўк дарвоза",
    });
    expect(vi.mocked(recordAudit)).toHaveBeenCalled();
  });

  it("logs lat, lng when there is no label", async () => {
    await PATCH(req({ lat: 40.6, lng: 72.4 }), ctx);
    expect(eventCreate.mock.calls[0][0].data.message).toBe("Манзил белгиланди: 40.6, 72.4");
  });

  it("clears the pin and logs DELIVERY_LOCATION_CLEARED", async () => {
    const res = await PATCH(req({ lat: null, lng: null }), ctx);
    expect(res.status).toBe(200);
    expect(orderUpdate.mock.calls[0][0].data).toEqual({
      deliveryLat: null,
      deliveryLng: null,
      deliveryLocationUrl: null,
      deliveryLocationLabel: null,
    });
    expect(eventCreate.mock.calls[0][0].data).toMatchObject({ type: "DELIVERY_LOCATION_CLEARED", message: "Манзил ўчирилди" });
  });

  it("refuses finished orders with 409", async () => {
    for (const o of [{ status: "DELIVERED", shortClosedAt: null }, { status: "CANCELED", shortClosedAt: null }, { status: "PLACED", shortClosedAt: new Date() }]) {
      orderFindUnique.mockResolvedValue({ id: "o1", orderNumber: "B", ...o });
      const res = await PATCH(req({ lat: 40.6, lng: 72.4 }), ctx);
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatch(/Ёпилган буюртманинг манзилини/);
    }
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("rejects bad coordinates and non-http links", async () => {
    expect((await PATCH(req({ lat: 200, lng: 0 }), ctx)).status).toBe(422);
    expect((await PATCH(req({ lat: 40, lng: 72, url: "javascript:alert(1)" }), ctx)).status).toBe(422);
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("404s an unknown order and needs order.edit", async () => {
    orderFindUnique.mockResolvedValue(null);
    expect((await PATCH(req({ lat: 40, lng: 72 }), ctx)).status).toBe(404);
    vi.mocked(getCurrentUser).mockResolvedValue({ ...user, permissions: ["order.view"] });
    expect((await PATCH(req({ lat: 40, lng: 72 }), ctx)).status).toBe(403);
  });
});
