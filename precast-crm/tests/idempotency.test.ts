import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Row = { id: string; userId: string; route: string; status: string; responseStatus: number | null; responseBody: unknown; createdAt: Date };
const table = new Map<string, Row>();
const pruneCalls: unknown[] = [];
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
      deleteMany: async (args: unknown) => { pruneCalls.push(args); return { count: 0 }; },
    },
  },
}));

import { withIdempotency, bodyScope, formFieldsScope } from "@/lib/idempotency";
import { fail } from "@/lib/api";
import { overloadRefusal } from "@/lib/gazoblok-rules";

const ctx = { user: { id: "u1", email: "", name: "", role: "SALES" as const, permissions: [], isActive: true, mustChangePassword: false }, params: {} };
const req = (key?: string, url = "http://localhost/api/orders/o1/delivery-proof") =>
  new NextRequest(new URL(url), {
    method: "POST", headers: key ? { "idempotency-key": key } : {},
  });

beforeEach(() => { table.clear(); pruneCalls.length = 0; });

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
    table.set("u1:k9", { id: "u1:k9", userId: "u1", route: "/api/orders/o1/delivery-proof", status: "IN_PROGRESS", responseStatus: null, responseBody: null, createdAt: new Date() });
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

  it("rejects a key reused for a different route", async () => {
    const inner = vi.fn(async () => Response.json({ ok: true, data: {} }));
    const wrapped = withIdempotency(inner);
    await wrapped(req("k4", "http://localhost/api/orders/o1/comments"), ctx);
    const res = await wrapped(req("k4", "http://localhost/api/orders/o1/delivery-proof"), ctx);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(422);
    expect((await res.json()).details.code).toBe("IDEMPOTENT_ROUTE_MISMATCH");
  });

  // Phase 2b: POST /api/projects and POST /api/orders were newly wrapped.
  // A key is scoped `${userId}:${key}` with NO route in the id itself — the
  // route is only checked on a hit. So a key reused across /api/payments,
  // /api/projects and /api/orders must not silently collide; it must be
  // rejected the same way any other cross-route reuse is.
  it("does not let a save-draft/place-order key collide with a payments key", async () => {
    const inner = vi.fn(async () => Response.json({ ok: true, data: {} }, { status: 201 }));
    const wrapped = withIdempotency(inner);
    await wrapped(req("k5", "http://localhost/api/payments"), ctx);
    const res = await wrapped(req("k5", "http://localhost/api/projects"), ctx);
    expect(inner).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(422);
    expect((await res.json()).details.code).toBe("IDEMPOTENT_ROUTE_MISMATCH");
  });

  it("replays /api/orders and /api/projects like any other wrapped route: no key untouched, same key one row + replay", async () => {
    for (const url of ["http://localhost/api/projects", "http://localhost/api/orders"]) {
      table.clear(); // fresh key namespace per iteration — same key "k6" is reused below
      let n = 0;
      const inner = vi.fn(async () => Response.json({ ok: true, data: { n: ++n } }, { status: 201 }));
      const wrapped = withIdempotency(inner);

      // No header — untouched, runs every time, nothing stored.
      await wrapped(req(undefined, url), ctx);
      await wrapped(req(undefined, url), ctx);
      expect(inner).toHaveBeenCalledTimes(2);

      // Same key twice — one row created, second call replays the first body.
      const a = await wrapped(req("k6", url), ctx);
      const b = await wrapped(req("k6", url), ctx);
      expect(inner).toHaveBeenCalledTimes(3);
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect((await b.json()).data.n).toBe(3);
      expect(b.headers.get("Idempotency-Replayed")).toBe("true");
    }
  });

  it("does not strand the row when content-type says JSON but the body isn't", async () => {
    const inner = vi.fn(
      async () => new Response("not json", { status: 200, headers: { "content-type": "application/json" } }),
    );
    const wrapped = withIdempotency(inner);
    const a = await wrapped(req("k3"), ctx);
    const b = await wrapped(req("k3"), ctx);
    expect(inner).toHaveBeenCalledTimes(2);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await a.text()).toBe("not json");
    expect(await b.text()).toBe("not json");
  });
  // Gazoblok truck load (Stage 4 W1): a 409 OVERLOAD_CONFIRM_REQUIRED is a definitive
  // answer, so it is stored like any 4xx. The phone resends a dropped request with the
  // SAME key (gets the same 409 back, nothing written) and sends the confirmed load
  // (confirmOverload=true) under a NEW key, which runs fresh.
  it("stores an over-load 409 for its key; the confirmed resend under a new key runs", async () => {
    const url = "http://localhost/api/gazoblok/orders/g1/shipments/s1/load";
    const refusal = overloadRefusal([{ id: "A", productLabel: "600×300×200", unitPrice: 18000 }], [{ lineId: "A", extra: 5 }])!;
    const writes: string[] = [];
    const inner = vi.fn(async (r: NextRequest) => {
      if (r.headers.get("x-confirm") !== "true") return fail(refusal.message, refusal.status, refusal.details);
      writes.push("load");
      return Response.json({ ok: true, data: { id: "s1", status: "LOADED" } });
    });
    const wrapped = withIdempotency(inner);
    const send = (key: string, confirm: boolean) =>
      wrapped(new NextRequest(new URL(url), { method: "POST", headers: { "idempotency-key": key, "x-confirm": String(confirm) } }), ctx);

    const first = await send("load-1", false);
    expect(first.status).toBe(409);
    const retried = await send("load-1", false);
    expect(retried.status).toBe(409);
    expect(retried.headers.get("Idempotency-Replayed")).toBe("true");
    expect((await retried.json()).details.code).toBe("OVERLOAD_CONFIRM_REQUIRED");

    const confirmed = await send("load-2", true);
    expect(confirmed.status).toBe(200);
    const confirmedRetry = await send("load-2", true);
    expect(confirmedRetry.headers.get("Idempotency-Replayed")).toBe("true");
    expect(writes).toEqual(["load"]);
    expect(inner).toHaveBeenCalledTimes(2);
  });

  // Final review #1: a row stuck IN_PROGRESS (handler committed, marking DONE failed)
  // must never re-open the key — re-running could record a payment twice.
  it("answers a stale IN_PROGRESS row with IDEMPOTENT_STALE and never runs the handler", async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000);
    table.set("u1:k10", { id: "u1:k10", userId: "u1", route: "/api/orders/o1/delivery-proof", status: "IN_PROGRESS", responseStatus: null, responseBody: null, createdAt: old });
    const inner = vi.fn(async () => Response.json({ ok: true, data: {} }));
    const res = await withIdempotency(inner)(req("k10"), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).details.code).toBe("IDEMPOTENT_STALE");
    expect(inner).not.toHaveBeenCalled();
  });

  it("keeps answering a fresh IN_PROGRESS row with IDEMPOTENT_IN_PROGRESS", async () => {
    table.set("u1:k11", { id: "u1:k11", userId: "u1", route: "/api/orders/o1/delivery-proof", status: "IN_PROGRESS", responseStatus: null, responseBody: null, createdAt: new Date(Date.now() - 30 * 1000) });
    const res = await withIdempotency(vi.fn())(req("k11"), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).details.code).toBe("IDEMPOTENT_IN_PROGRESS");
  });

  it("replays an old DONE row unchanged (stale rule only touches IN_PROGRESS)", async () => {
    table.set("u1:k12", { id: "u1:k12", userId: "u1", route: "/api/orders/o1/delivery-proof", status: "DONE", responseStatus: 201, responseBody: { ok: true, data: { n: 7 } }, createdAt: new Date(Date.now() - 60 * 60 * 1000) });
    const inner = vi.fn();
    const res = await withIdempotency(inner)(req("k12"), ctx);
    expect(res.status).toBe(201);
    expect((await res.json()).data.n).toBe(7);
    expect(inner).not.toHaveBeenCalled();
  });

  it("prunes only DONE rows after 24 h; stuck IN_PROGRESS rows live 30 days", async () => {
    await withIdempotency(async () => Response.json({ ok: true, data: {} }))(req("k13"), ctx);
    expect(pruneCalls).toHaveLength(1);
    const where = (pruneCalls[0] as { where: { OR: { status?: string; createdAt: { lt: Date } }[] } }).where;
    const day = 24 * 60 * 60 * 1000;
    const done = where.OR.find((c) => c.status === "DONE")!;
    const any = where.OR.find((c) => c.status === undefined)!;
    expect(Math.round((Date.now() - done.createdAt.lt.getTime()) / day)).toBe(1);
    expect(Math.round((Date.now() - any.createdAt.lt.getTime()) / day)).toBe(30);
  });

  // Final review #2: opt-in scope — a key reused with a different body on the same
  // route is refused instead of replaying the first action's answer.
  describe("scope option", () => {
    const url = "http://localhost/api/gazoblok/orders/g1";
    const patch = (key: string, body: unknown) =>
      new NextRequest(new URL(url), { method: "PATCH", headers: { "idempotency-key": key, "content-type": "application/json" }, body: JSON.stringify(body) });
    const scope = async (r: NextRequest) => JSON.stringify(await r.json());

    it("replays the same body and lets the handler still read it", async () => {
      const seen: unknown[] = [];
      const inner = vi.fn(async (r: NextRequest) => { seen.push(await r.json()); return Response.json({ ok: true, data: {} }); });
      const wrapped = withIdempotency(inner, { scope });
      await wrapped(patch("s1", { action: "record_payment", amount: 100 }), ctx);
      const b = await wrapped(patch("s1", { action: "record_payment", amount: 100 }), ctx);
      expect(inner).toHaveBeenCalledTimes(1);
      expect(seen).toEqual([{ action: "record_payment", amount: 100 }]);
      expect(b.headers.get("Idempotency-Replayed")).toBe("true");
    });

    it("refuses a reused key with a different body with 422 IDEMPOTENT_SCOPE_MISMATCH", async () => {
      const inner = vi.fn(async () => Response.json({ ok: true, data: {} }));
      const wrapped = withIdempotency(inner, { scope });
      await wrapped(patch("s2", { action: "record_payment", amount: 100 }), ctx);
      const res = await wrapped(patch("s2", { action: "close_short" }), ctx);
      expect(inner).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(422);
      expect((await res.json()).details.code).toBe("IDEMPOTENT_SCOPE_MISMATCH");
    });

    it("scopes multipart on stable fields, not file bytes", async () => {
      const loadUrl = "http://localhost/api/gazoblok/orders/g1/shipments/s1/load";
      const form = (lines: string, photo: string) => {
        const fd = new FormData();
        fd.set("loadedLines", lines);
        fd.set("file", new File([photo], "p.jpg", { type: "image/jpeg" }));
        return new NextRequest(new URL(loadUrl), { method: "POST", headers: { "idempotency-key": "m1" }, body: fd });
      };
      const formScope = async (r: NextRequest) => String((await r.formData()).get("loadedLines"));
      const inner = vi.fn(async (r: NextRequest) => { await r.formData(); return Response.json({ ok: true, data: {} }); });
      const wrapped = withIdempotency(inner, { scope: formScope });
      await wrapped(form('{"A":5}', "bytes-1"), ctx);
      const same = await wrapped(form('{"A":5}', "bytes-2"), ctx);
      expect(same.headers.get("Idempotency-Replayed")).toBe("true");
      const diff = await wrapped(form('{"A":6}', "bytes-1"), ctx);
      expect(diff.status).toBe(422);
      expect(inner).toHaveBeenCalledTimes(1);
    });

    it("still reports a different route as IDEMPOTENT_ROUTE_MISMATCH", async () => {
      const wrapped = withIdempotency(vi.fn(async () => Response.json({ ok: true, data: {} })), { scope });
      await wrapped(patch("s3", { action: "close_short" }), ctx);
      const res = await withIdempotency(vi.fn())(req("s3", "http://localhost/api/payments"), ctx);
      expect((await res.json()).details.code).toBe("IDEMPOTENT_ROUTE_MISMATCH");
    });
  });

  it("bodyScope reads the raw body; formFieldsScope reads named fields only", async () => {
    const r = new NextRequest(new URL("http://localhost/x"), { method: "PATCH", body: '{"action":"close_short"}' });
    expect(await bodyScope(r)).toBe('{"action":"close_short"}');
    const fd = new FormData();
    fd.set("loadedLines", '{"A":1}');
    fd.set("file", new File(["x"], "p.jpg", { type: "image/jpeg" }));
    const m = new NextRequest(new URL("http://localhost/x"), { method: "POST", body: fd });
    expect(await formFieldsScope("loadedLines", "confirmOverload")(m)).toBe(JSON.stringify(['{"A":1}', null]));
  });
});
