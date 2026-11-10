import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
const clientFindUnique = vi.fn();
const clientFindMany = vi.fn();
const orderCount = vi.fn();
const orderGroupBy = vi.fn();
const gazoblokFindMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    client: {
      findUnique: (...a: unknown[]) => clientFindUnique(...a),
      findMany: (...a: unknown[]) => clientFindMany(...a),
    },
    order: {
      count: (...a: unknown[]) => orderCount(...a),
      groupBy: (...a: unknown[]) => orderGroupBy(...a),
    },
    gazoblokOrder: { findMany: (...a: unknown[]) => gazoblokFindMany(...a) },
  },
}));

import { getCurrentUser } from "@/lib/auth";
import { GET as getOne } from "@/app/api/clients/[id]/route";
import { GET as getList } from "@/app/api/clients/route";

const user = { id: "u1", email: "", name: "A", role: "SALES" as const, permissions: ["client.view"], isActive: true, mustChangePassword: false };

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue(user);
  for (const f of [clientFindUnique, clientFindMany, orderCount, orderGroupBy, gazoblokFindMany]) f.mockReset();
});

const req = (url: string) => new NextRequest(new URL(url));

describe("GET /api/clients/[id] — gazoblok is additive (spec §7)", () => {
  it("keeps the beam fields and adds gazoblokOrders + gazoblok summary", async () => {
    clientFindUnique.mockResolvedValue({ id: "c1", name: "Ali", deals: [], orders: [], gazoblokOrders: [{ id: "g1" }] });
    orderCount.mockResolvedValue(2);
    orderGroupBy.mockResolvedValue([{ clientId: "c1", _sum: { totalPrice: 7_000_000 } }]);
    gazoblokFindMany.mockResolvedValue([
      { status: "PLACED", totalPrice: 5_000_000, confirmedPaid: 2_000_000 },
      { status: "CANCELED", totalPrice: 9_000_000, confirmedPaid: 0 },
    ]);
    const res = await getOne(req("http://localhost/api/clients/c1"), { params: { id: "c1" } });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.totalBooked).toBe(7_000_000);
    expect(data.orderCount).toBe(2);
    expect(data.deals).toEqual([]);
    expect(data.orders).toEqual([]);
    expect(data.gazoblokOrders).toEqual([{ id: "g1" }]);
    expect(data.gazoblok).toEqual({ orderCount: 2, totalBooked: 5_000_000, debt: 3_000_000 });

    const inc = clientFindUnique.mock.calls[0][0].include;
    expect(inc.gazoblokOrders.take).toBe(20);
    expect(inc.gazoblokOrders.orderBy).toEqual({ placedAt: "desc" });
    expect(Object.keys(inc.gazoblokOrders.select).sort()).toEqual(
      ["confirmedPaid", "id", "orderNumber", "paymentState", "placedAt", "shortClosedAt", "status", "totalBlocks", "totalPrice"],
    );
    expect(gazoblokFindMany.mock.calls[0][0].where).toEqual({ clientId: "c1" });
  });

  it("still 404s an unknown client without touching gazoblok", async () => {
    clientFindUnique.mockResolvedValue(null);
    const res = await getOne(req("http://localhost/api/clients/x"), { params: { id: "x" } });
    expect(res.status).toBe(404);
    expect(gazoblokFindMany).not.toHaveBeenCalled();
  });

  it("still requires client.view", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...user, permissions: [] });
    const res = await getOne(req("http://localhost/api/clients/c1"), { params: { id: "c1" } });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/clients — counts gazoblok orders", () => {
  it("adds gazoblokOrders to the _count include, keeping deals and orders", async () => {
    clientFindMany.mockResolvedValue([]);
    const res = await getList(req("http://localhost/api/clients"), { params: {} });
    expect(res.status).toBe(200);
    expect(clientFindMany.mock.calls[0][0].include).toEqual({
      _count: { select: { deals: true, orders: true, gazoblokOrders: true } },
    });
  });
});
