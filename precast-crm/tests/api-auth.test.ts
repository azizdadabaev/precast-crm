import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// vi.mock must run before the module under test is imported. We mock
// the auth module to bypass real cookie/JWT/Prisma machinery — the
// functions under test should only care about what `getCurrentUser`
// returns and what `can()` decides about it.
vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from "@/lib/auth";
import { withAuth, withPermission, withPermissionAny } from "@/lib/api-auth";

const getCurrentUserMock = vi.mocked(getCurrentUser);

const fakeReq = () =>
  new NextRequest(new URL("http://localhost/api/x"), { method: "GET" });

const fakeCtx = { params: {} as Record<string, string> };

const userWith = (perms: string[], extra: Partial<{ isActive: boolean }> = {}) => ({
  id: "u1",
  email: "x@example.com",
  name: "Test",
  role: "ADMIN" as const,
  permissions: perms,
  isActive: true,
  mustChangePassword: false,
  ...extra,
});

beforeEach(() => {
  getCurrentUserMock.mockReset();
});

describe("withPermission", () => {
  it("returns 401 when no user is logged in", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const handler = withPermission("order.view", async () => Response.json({ ok: true }));
    const res = await handler(fakeReq(), fakeCtx);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { ok: boolean; error?: string };
    expect(body.ok).toBe(false);
  });

  it("returns 403 when user is disabled", async () => {
    getCurrentUserMock.mockResolvedValue(userWith(["order.view"], { isActive: false }));
    const handler = withPermission("order.view", async () => Response.json({ ok: true }));
    const res = await handler(fakeReq(), fakeCtx);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/disabled/i);
  });

  it("returns 403 when user lacks the action", async () => {
    getCurrentUserMock.mockResolvedValue(userWith(["client.view"]));
    const handler = withPermission("order.cancel", async () => Response.json({ ok: true }));
    const res = await handler(fakeReq(), fakeCtx);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/Permission denied/);
    expect(body.error).toMatch(/order\.cancel/);
  });

  it("calls the inner handler with user + params on success", async () => {
    getCurrentUserMock.mockResolvedValue(userWith(["order.view"]));
    const inner = vi.fn(async (_req, { user, params }) => {
      return Response.json({ id: user.id, params });
    });
    const handler = withPermission<{ id: string }>("order.view", inner);
    const res = await handler(fakeReq(), { params: { id: "abc" } });
    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(1);
    const body = (await res.json()) as { id: string; params: { id: string } };
    expect(body.id).toBe("u1");
    expect(body.params.id).toBe("abc");
  });

  it("translates ZodError thrown by the inner handler into a 422", async () => {
    getCurrentUserMock.mockResolvedValue(userWith(["order.view"]));
    const { z } = await import("zod");
    const handler = withPermission("order.view", async () => {
      z.object({ x: z.string() }).parse({});
      return Response.json({ ok: true });
    });
    const res = await handler(fakeReq(), fakeCtx);
    expect(res.status).toBe(422);
  });
});

describe("withPermissionAny", () => {
  it("admits a user with at least one of the listed actions", async () => {
    getCurrentUserMock.mockResolvedValue(userWith(["dashboard.view"]));
    const handler = withPermissionAny(
      ["dashboard.view", "dashboard.viewBasic"],
      async () => Response.json({ ok: true }),
    );
    const res = await handler(fakeReq(), fakeCtx);
    expect(res.status).toBe(200);
  });

  it("rejects a user with none of the listed actions", async () => {
    getCurrentUserMock.mockResolvedValue(userWith(["client.view"]));
    const handler = withPermissionAny(
      ["dashboard.view", "dashboard.viewBasic"],
      async () => Response.json({ ok: true }),
    );
    const res = await handler(fakeReq(), fakeCtx);
    expect(res.status).toBe(403);
  });
});

describe("withAuth", () => {
  it("returns 401 with no session", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const handler = withAuth(async () => Response.json({ ok: true }));
    const res = await handler(fakeReq(), fakeCtx);
    expect(res.status).toBe(401);
  });

  it("returns 403 for a disabled user", async () => {
    getCurrentUserMock.mockResolvedValue(userWith([], { isActive: false }));
    const handler = withAuth(async () => Response.json({ ok: true }));
    const res = await handler(fakeReq(), fakeCtx);
    expect(res.status).toBe(403);
  });

  it("calls the handler for any active user, no permission check", async () => {
    getCurrentUserMock.mockResolvedValue(userWith([])); // empty permissions OK
    const handler = withAuth(async (_req, { user }) =>
      Response.json({ id: user.id }),
    );
    const res = await handler(fakeReq(), fakeCtx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    expect(body.id).toBe("u1");
  });
});
