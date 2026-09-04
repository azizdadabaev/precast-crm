import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Row = { id: string; userId: string; route: string; status: string; responseStatus: number | null; responseBody: unknown; createdAt: Date };
const table = new Map<string, Row>();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    idempotencyKey: {
      findUnique: async ({ where }: { where: { id: string } }) => table.get(where.id) ?? null,
      create: async ({ data }: { data: Omit<Row, "createdAt" | "status" | "responseStatus" | "responseBody"> }) => {
        if (table.has(data.id)) {
          const err = Object.assign(new Error("unique"), { code: "P2002" });
          throw err;
        }
        const row: Row = { ...data, status: "IN_PROGRESS", responseStatus: null, responseBody: null, createdAt: new Date() };
        table.set(data.id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = table.get(where.id)!;
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => { table.delete(where.id); },
      deleteMany: async () => ({ count: 0 }),
    },
  },
}));

import { withIdempotency } from "@/lib/idempotency";

const ctx = { user: { id: "u1", email: "", name: "", role: "SALES" as const, permissions: [], isActive: true, mustChangePassword: false }, params: {} };
const req = (key?: string) =>
  new NextRequest(new URL("http://localhost/api/orders/o1/delivery-proof"), {
    method: "POST", headers: key ? { "idempotency-key": key } : {},
  });

beforeEach(() => table.clear());

describe("withIdempotency", () => {
  it("passes through when no header is sent", async () => {
    const inner = vi.fn(async () => Response.json({ ok: true, data: { n: 1 } }));
    const res = await withIdempotency(inner)(req(), ctx);
    expect(inner).toHaveBeenCalledTimes(1);
    expect((await res.json()).data.n).toBe(1);
  });

  it("runs once and replays the stored response for the same user+key", async () => {
    let n = 0;
    const inner = vi.fn(async () => Response.json({ ok: true, data: { n: ++n } }, { status: 201 }));
    const wrapped = withIdempotency(inner);
    const a = await wrapped(req("k1"), ctx);
    const b = await wrapped(req("k1"), ctx);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect((await b.json()).data.n).toBe(1);
    expect(b.headers.get("Idempotency-Replayed")).toBe("true");
  });

  it("scopes keys per user", async () => {
    const inner = vi.fn(async () => Response.json({ ok: true, data: {} }));
    const wrapped = withIdempotency(inner);
    await wrapped(req("k1"), ctx);
    await wrapped(req("k1"), { ...ctx, user: { ...ctx.user, id: "u2" } });
    expect(inner).toHaveBeenCalledTimes(2);
  });

  it("returns 409 while the first attempt is still in progress", async () => {
    table.set("u1:k9", { id: "u1:k9", userId: "u1", route: "/api/x", status: "IN_PROGRESS", responseStatus: null, responseBody: null, createdAt: new Date() });
    const inner = vi.fn(async () => Response.json({ ok: true, data: {} }));
    const res = await withIdempotency(inner)(req("k9"), ctx);
    expect(res.status).toBe(409);
    expect(inner).not.toHaveBeenCalled();
  });

  it("does not cache 5xx so the client can retry", async () => {
    const inner = vi.fn(async () => Response.json({ ok: false, error: "boom" }, { status: 500 }));
    const wrapped = withIdempotency(inner);
    await wrapped(req("k2"), ctx);
    await wrapped(req("k2"), ctx);
    expect(inner).toHaveBeenCalledTimes(2);
  });
});
