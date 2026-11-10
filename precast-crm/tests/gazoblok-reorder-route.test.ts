import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
const orderFindUnique = vi.fn();
const productFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    gazoblokOrder: { findUnique: (...a: unknown[]) => orderFindUnique(...a) },
    gazoblokProduct: { findMany: (...a: unknown[]) => productFindMany(...a) },
  },
}));

import { getCurrentUser } from "@/lib/auth";
import { GET } from "@/app/api/gazoblok/orders/[id]/reorder/route";

const user = { id: "u1", email: "", name: "Op", role: "SALES" as const, permissions: ["order.create"], isActive: true, mustChangePassword: false };
const req = () => new NextRequest(new URL("http://localhost/api/gazoblok/orders/o1/reorder"));
const ctx = { params: { id: "o1" } };

beforeEach(() => {
  orderFindUnique.mockReset();
  productFindMany.mockReset();
  vi.mocked(getCurrentUser).mockResolvedValue(user);
});

describe("GET /api/gazoblok/orders/[id]/reorder", () => {
  it("returns the draft at today's prices with the archived size dropped", async () => {
    orderFindUnique.mockResolvedValue({
      id: "o1",
      orderNumber: "B-2026-11-0012",
      placedAt: new Date("2026-11-01T05:00:00Z"),
      status: "DELIVERED",
      deliveryCost: 300_000,
      discountPercent: 0,
      scheduledAt: null,
      client: { name: "Тест Мижоз", phone: "998901112233", address: null },
      lines: [
        { id: "A", productId: "pA", productLabel: "600×300×200", quantity: 200, unitPrice: 18_000 },
        { id: "B", productId: "pB", productLabel: "600×300×300", quantity: 100, unitPrice: 25_000 },
      ],
      shipments: [{ loadedLines: { A: 220, B: 100 } }],
    });
    productFindMany.mockResolvedValue([
      { id: "pA", label: "600×300×200", pricePerBlock: 20_000, active: true },
      { id: "pB", label: "600×300×300", pricePerBlock: 26_000, active: false },
    ]);
    const res = await GET(req(), ctx);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.source).toEqual({ id: "o1", orderNumber: "B-2026-11-0012", placedAt: "2026-11-01T05:00:00.000Z", status: "DELIVERED" });
    expect(data.lines).toEqual([
      { productId: "pA", label: "600×300×200", quantity: 200, unitPrice: 20_000, previousUnitPrice: 18_000, previousLoaded: 220 },
    ]);
    expect(data.dropped).toEqual([{ label: "600×300×300", quantity: 100 }]);
    expect(data.previous).toEqual({ deliveryCost: 300_000, discountPercent: 0, scheduledAt: null });
    expect(orderFindUnique.mock.calls[0][0].include.client).toBe(true);
  });

  it("404s an unknown order", async () => {
    orderFindUnique.mockResolvedValue(null);
    const res = await GET(req(), ctx);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/Буюртма топилмади/);
  });

  it("needs order.create", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...user, permissions: ["order.view"] });
    expect((await GET(req(), ctx)).status).toBe(403);
    expect(orderFindUnique).not.toHaveBeenCalled();
  });
});
