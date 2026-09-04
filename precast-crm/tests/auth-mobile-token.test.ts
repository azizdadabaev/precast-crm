import { describe, it, expect, vi, beforeEach } from "vitest";
import { decodeJwt } from "jose";

const cookieStore = { get: vi.fn() };
const headerStore = { get: vi.fn() };
vi.mock("next/headers", () => ({
  cookies: () => cookieStore,
  headers: () => headerStore,
}));
const findUnique = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

import { signToken, getCurrentUser } from "@/lib/auth";
import { LoginSchema } from "@/lib/validation";

const base = { sub: "u1", email: "", name: "Азиз", role: "OWNER" as const };
const dbUser = {
  id: "u1", email: "", name: "Азиз", role: "OWNER", permissions: [],
  isActive: true, mustChangePassword: false, tokenVersion: 3,
};

beforeEach(() => {
  cookieStore.get.mockReturnValue(undefined);
  headerStore.get.mockReset();
  findUnique.mockReset();
  findUnique.mockResolvedValue(dbUser);
});

describe("signToken mobile options", () => {
  it("stamps aud=mobile, tv, and a 30-day expiry", async () => {
    const t = await signToken(base, { expiresIn: "30d", audience: "mobile", tokenVersion: 3 });
    const c = decodeJwt(t);
    expect(c.aud).toBe("mobile");
    expect(c.tv).toBe(3);
    expect((c.exp as number) - (c.iat as number)).toBe(30 * 24 * 3600);
  });
  it("web tokens carry no tv and keep the default expiry", async () => {
    const c = decodeJwt(await signToken(base));
    expect(c.tv).toBeUndefined();
    expect(c.aud).toBeUndefined();
  });
});

describe("tokenVersion enforcement", () => {
  it("accepts a mobile token whose tv matches the user row", async () => {
    const t = await signToken(base, { audience: "mobile", tokenVersion: 3 });
    headerStore.get.mockReturnValue(`Bearer ${t}`);
    expect((await getCurrentUser())?.id).toBe("u1");
  });
  it("rejects a mobile token whose tv is stale", async () => {
    const t = await signToken(base, { audience: "mobile", tokenVersion: 2 });
    headerStore.get.mockReturnValue(`Bearer ${t}`);
    expect(await getCurrentUser()).toBeNull();
  });
  it("still accepts a web token with no tv claim", async () => {
    headerStore.get.mockReturnValue(`Bearer ${await signToken(base)}`);
    expect((await getCurrentUser())?.id).toBe("u1");
  });
});

describe("LoginSchema.client", () => {
  it("defaults to web and accepts android", () => {
    expect(LoginSchema.parse({ loginName: "a", pin: "1234" }).client).toBe("web");
    expect(LoginSchema.parse({ loginName: "a", pin: "1234", client: "android" }).client).toBe("android");
    expect(LoginSchema.safeParse({ loginName: "a", pin: "1234", client: "ios" }).success).toBe(false);
  });
});
