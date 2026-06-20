import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Bypass real cookie/JWT/Prisma auth — the route is gated by withPermission,
// which only consults getCurrentUser + can(). Give the test user the
// blender.bridge permission the route requires. (Same harness as api-auth.test.ts.)
vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(),
}));

// No real browser in this env — stub the headless PDF render.
vi.mock("@/lib/cad/sheet/render-pdf", () => ({
  renderSheetPdf: vi.fn(async () => Buffer.from("%PDF-1.4 test")),
}));

import { getCurrentUser } from "@/lib/auth";
import { POST } from "@/app/api/drawings/render/route";

const getCurrentUserMock = vi.mocked(getCurrentUser);

const owner = {
  id: "u1",
  email: "x@example.com",
  name: "Owner",
  role: "ADMIN" as const,
  permissions: ["blender.bridge"],
  isActive: true,
  mustChangePassword: false,
};

const postReq = (body: unknown) =>
  new NextRequest(new URL("http://localhost/api/drawings/render"), {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

const ctx = { params: {} as Record<string, string> };

beforeEach(() => {
  getCurrentUserMock.mockReset();
  getCurrentUserMock.mockResolvedValue(owner);
});

describe("POST /api/drawings/render", () => {
  it("renders a valid room to a PDF (200, application/pdf, non-empty body)", async () => {
    const res = await POST(postReq({ rooms: [{ inner_width: 3.2, inner_length: 5 }] }), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(0);
  });

  it("rejects an empty rooms array with 400", async () => {
    const res = await POST(postReq({ rooms: [] }), ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });
});
