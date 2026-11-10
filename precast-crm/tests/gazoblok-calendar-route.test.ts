import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
const findMany = vi.fn();
const count = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    gazoblokOrder: {
      findMany: (...a: unknown[]) => findMany(...a),
      count: (...a: unknown[]) => count(...a),
    },
  },
}));

import { getCurrentUser } from "@/lib/auth";
import { GET } from "@/app/api/gazoblok/orders/calendar/route";

const user = { id: "u1", email: "", name: "Op", role: "SALES" as const, permissions: ["order.view"], isActive: true, mustChangePassword: false };
const req = (qs: string) => new NextRequest(new URL(`http://localhost/api/gazoblok/orders/calendar${qs}`));

beforeEach(() => {
  findMany.mockReset();
  count.mockReset();
  vi.mocked(getCurrentUser).mockResolvedValue(user);
  findMany.mockResolvedValue([
    {
      status: "PLACED",
      scheduledAt: new Date(2026, 10, 11, 10),
      totalBlocks: 240,
      totalPrice: "1000000.00",
      confirmedPaid: "0.00",
      overshipAmount: "0.00",
    },
  ]);
  count.mockResolvedValue(3);
});

describe("GET /api/gazoblok/orders/calendar", () => {
  it("returns the month's days and the open unscheduled count", async () => {
    const res = await GET(req("?month=2026-11"), { params: {} });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({
      month: "2026-11",
      days: [{ date: "2026-11-11", orders: 1, blocks: 240, flags: { debt: false, unpaid: true } }],
      unscheduledOpen: 3,
    });
    const where = findMany.mock.calls[0][0].where;
    expect(where.scheduledAt).toEqual({ gte: new Date(2026, 10, 1), lt: new Date(2026, 11, 1) });
    expect(where.status).toEqual({ not: "CANCELED" });
    expect(count.mock.calls[0][0].where).toEqual({ scheduledAt: null, status: { in: ["PLACED", "IN_PRODUCTION"] } });
  });

  it("refuses a malformed month", async () => {
    const res = await GET(req("?month=11.2026"), { params: {} });
    expect(res.status).toBe(400);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("needs order.view", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...user, permissions: [] });
    const res = await GET(req("?month=2026-11"), { params: {} });
    expect(res.status).toBe(403);
  });
});
