import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from "@/lib/auth";
import { resolveHandoffCaller } from "@/lib/handoff-caller";

const getCurrentUserMock = vi.mocked(getCurrentUser);

const DEVICE_TOKEN = "s3cret-device-token-value";

const req = (auth?: string) =>
  new NextRequest(new URL("http://localhost/api/handoff"), {
    method: "POST",
    headers: auth ? { authorization: auth } : undefined,
  });

const user = (perms: string[], extra: Partial<{ isActive: boolean }> = {}) => ({
  id: "u1",
  email: "x@example.com",
  name: "Азиз",
  role: "OWNER" as const,
  permissions: perms,
  isActive: true,
  mustChangePassword: false,
  ...extra,
});

const original = process.env.HANDOFF_DEVICE_TOKEN;
beforeEach(() => {
  getCurrentUserMock.mockReset();
  getCurrentUserMock.mockResolvedValue(null);
  process.env.HANDOFF_DEVICE_TOKEN = DEVICE_TOKEN;
});
afterEach(() => {
  process.env.HANDOFF_DEVICE_TOKEN = original;
});

/**
 * Two clients send two different credentials in the SAME header. Everything
 * here is about keeping them apart — and about the device token never
 * accidentally becoming a user, which is the whole point of its narrow scope.
 */
describe("resolveHandoffCaller", () => {
  it("accepts the device token and names nobody", async () => {
    const caller = await resolveHandoffCaller(req(`Bearer ${DEVICE_TOKEN}`));
    expect(caller).toEqual({ kind: "device", userId: null });
    // The device path must not even look up a session — it has none.
    expect(getCurrentUserMock).not.toHaveBeenCalled();
  });

  it("accepts a signed-in operator holding inbox.access, and names them", async () => {
    getCurrentUserMock.mockResolvedValue(user(["inbox.access"]));
    const caller = await resolveHandoffCaller(req("Bearer some.jwt.value"));
    expect(caller).toMatchObject({ kind: "user", userId: "u1" });
  });

  it("rejects a signed-in user without inbox.access", async () => {
    getCurrentUserMock.mockResolvedValue(user(["order.view"]));
    expect(await resolveHandoffCaller(req("Bearer some.jwt.value"))).toBeNull();
  });

  it("rejects a disabled account that still holds the permission", async () => {
    getCurrentUserMock.mockResolvedValue(user(["inbox.access"], { isActive: false }));
    expect(await resolveHandoffCaller(req("Bearer some.jwt.value"))).toBeNull();
  });

  it("rejects a request with no credential at all", async () => {
    expect(await resolveHandoffCaller(req())).toBeNull();
  });

  /**
   * Fail-closed, and the reason it matters here: without this, an unset
   * HANDOFF_DEVICE_TOKEN plus a session-less request would have to be decided
   * by the session path alone — and a bug there would open the route to
   * anyone. Unset means no device caller, full stop.
   */
  it("admits no device caller when the secret is unset", async () => {
    delete process.env.HANDOFF_DEVICE_TOKEN;
    expect(await resolveHandoffCaller(req("Bearer anything"))).toBeNull();
  });

  /** A JWT in the header must not be mistaken for the device secret. */
  it("does not let a session token pass as the device token", async () => {
    getCurrentUserMock.mockResolvedValue(user(["inbox.access"]));
    const caller = await resolveHandoffCaller(req("Bearer eyJhbGciOiJIUzI1NiJ9.x.y"));
    expect(caller?.kind).toBe("user");
  });
});
