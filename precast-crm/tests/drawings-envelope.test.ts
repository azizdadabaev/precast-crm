import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
const findMany = vi.fn();
const findUnique = vi.fn();
const orderFindUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    drawingRequest: { findMany: (...a: unknown[]) => findMany(...a), findUnique: (...a: unknown[]) => findUnique(...a) },
    order: { findUnique: (...a: unknown[]) => orderFindUnique(...a) },
  },
}));

import { getCurrentUser } from "@/lib/auth";
import { GET as listGET } from "@/app/api/drawings/list/route";
import { GET as oneGET } from "@/app/api/drawings/request/[id]/route";

const owner = { id: "u1", email: "", name: "", role: "OWNER" as const, permissions: ["blender.bridge"], isActive: true, mustChangePassword: false };
beforeEach(() => { vi.mocked(getCurrentUser).mockResolvedValue(owner); findMany.mockReset(); findUnique.mockReset(); });

describe("drawings routes use the standard envelope", () => {
  it("list wraps rows in data", async () => {
    findMany.mockResolvedValue([{ id: "d1", status: "PENDING" }]);
    const res = await listGET(new NextRequest(new URL("http://localhost/api/drawings/list?projectId=p1")), { params: {} });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data[0].id).toBe("d1");
  });
  it("list returns ok:false on missing ids", async () => {
    const res = await listGET(new NextRequest(new URL("http://localhost/api/drawings/list")), { params: {} });
    expect(res.status).toBe(400);
    expect((await res.json()).ok).toBe(false);
  });
  it("single request wraps the row and 404s with ok:false", async () => {
    findUnique.mockResolvedValue({ id: "d1", status: "DELIVERED" });
    const ok = await oneGET(new NextRequest(new URL("http://localhost/api/drawings/request/d1")), { params: { id: "d1" } });
    expect((await ok.json()).data.status).toBe("DELIVERED");
    findUnique.mockResolvedValue(null);
    const nf = await oneGET(new NextRequest(new URL("http://localhost/api/drawings/request/x")), { params: { id: "x" } });
    expect(nf.status).toBe(404);
    expect((await nf.json()).ok).toBe(false);
  });
});
