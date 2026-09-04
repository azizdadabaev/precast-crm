import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/headers so getCurrentUser() can be driven without a request.
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

import { signToken, getCurrentUser, bearerFromHeader } from "@/lib/auth";

const dbUser = {
  id: "u1",
  email: "a@b.c",
  name: "Азиз",
  role: "OWNER",
  permissions: ["order.view"],
  isActive: true,
  mustChangePassword: false,
  tokenVersion: 0,
};

beforeEach(() => {
  cookieStore.get.mockReset();
  headerStore.get.mockReset();
  findUnique.mockReset();
  findUnique.mockResolvedValue(dbUser);
});

describe("bearerFromHeader", () => {
  it("extracts the token after 'Bearer '", () => {
    expect(bearerFromHeader("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });
  it("returns null for missing or malformed headers", () => {
    expect(bearerFromHeader(null)).toBeNull();
    expect(bearerFromHeader("Basic xyz")).toBeNull();
    expect(bearerFromHeader("Bearer ")).toBeNull();
  });
});

describe("getCurrentUser with Authorization header", () => {
  it("falls back to the Bearer header when no cookie is present", async () => {
    const token = await signToken({ sub: "u1", email: "a@b.c", name: "Азиз", role: "OWNER" });
    cookieStore.get.mockReturnValue(undefined);
    headerStore.get.mockImplementation((k: string) =>
      k.toLowerCase() === "authorization" ? `Bearer ${token}` : null,
    );
    const u = await getCurrentUser();
    expect(u?.id).toBe("u1");
  });

  it("prefers the cookie when both are present", async () => {
    const cookieTok = await signToken({ sub: "u1", email: "", name: "", role: "OWNER" });
    cookieStore.get.mockReturnValue({ value: cookieTok });
    headerStore.get.mockReturnValue("Bearer not-a-jwt");
    const u = await getCurrentUser();
    expect(u?.id).toBe("u1");
  });

  it("returns null when neither is valid", async () => {
    cookieStore.get.mockReturnValue(undefined);
    headerStore.get.mockReturnValue("Bearer garbage");
    expect(await getCurrentUser()).toBeNull();
  });
});
