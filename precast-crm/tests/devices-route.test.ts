import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
const upsert = vi.fn();
const deleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { device: { upsert: (...a: unknown[]) => upsert(...a), deleteMany: (...a: unknown[]) => deleteMany(...a) } },
}));

import { getCurrentUser } from "@/lib/auth";
import { PUT } from "@/app/api/devices/route";
import { DELETE } from "@/app/api/devices/[token]/route";
import { DeviceRegisterSchema } from "@/lib/validation";

const user = { id: "u1", email: "", name: "A", role: "SALES" as const, permissions: [], isActive: true, mustChangePassword: false };

beforeEach(() => {
  vi.mocked(getCurrentUser).mockResolvedValue(user);
  upsert.mockReset();
  deleteMany.mockReset();
});

const put = (body: unknown) =>
  new NextRequest(new URL("http://localhost/api/devices"), {
    method: "PUT", body: JSON.stringify(body), headers: { "content-type": "application/json" },
  });

describe("DeviceRegisterSchema", () => {
  it("requires fcmToken and platform=android", () => {
    expect(DeviceRegisterSchema.safeParse({ fcmToken: "abc", platform: "android" }).success).toBe(true);
    expect(DeviceRegisterSchema.safeParse({ fcmToken: "", platform: "android" }).success).toBe(false);
    expect(DeviceRegisterSchema.safeParse({ fcmToken: "abc", platform: "ios" }).success).toBe(false);
  });
});

describe("PUT /api/devices", () => {
  it("upserts by token and re-points it to the current user", async () => {
    upsert.mockResolvedValue({ id: "d1", fcmToken: "tok" });
    const res = await PUT(put({ fcmToken: "tok", platform: "android", appVersion: "1.0.0" }), { params: {} });
    expect(res.status).toBe(200);
    const arg = upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ fcmToken: "tok" });
    expect(arg.create.userId).toBe("u1");
    expect(arg.update.userId).toBe("u1");
    expect(arg.update.appVersion).toBe("1.0.0");
    const body = await res.json();
    expect(body.data.fcmToken).toBe("tok");
  });
  it("returns 401 without a session", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await PUT(put({ fcmToken: "tok", platform: "android" }), { params: {} });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/devices/[token]", () => {
  it("deletes only the caller's own row", async () => {
    deleteMany.mockResolvedValue({ count: 1 });
    const req = new NextRequest(new URL("http://localhost/api/devices/tok"), { method: "DELETE" });
    const res = await DELETE(req, { params: { token: "tok" } });
    expect(deleteMany).toHaveBeenCalledWith({ where: { fcmToken: "tok", userId: "u1" } });
    expect((await res.json()).data.deleted).toBe(true);
  });
});
