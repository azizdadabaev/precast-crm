import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/uploads", async (orig) => ({
  ...(await orig<typeof import("@/lib/uploads")>()),
  saveImageFromFormData: vi.fn(),
}));
const queryRaw = vi.fn();
const orderFindUnique = vi.fn();
const orderUpdate = vi.fn();
const eventCreate = vi.fn();
const tx = {
  $queryRaw: (...a: unknown[]) => queryRaw(...a),
  gazoblokOrder: { findUnique: (...a: unknown[]) => orderFindUnique(...a), update: (...a: unknown[]) => orderUpdate(...a) },
  gazoblokOrderEvent: { create: (...a: unknown[]) => eventCreate(...a) },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    gazoblokOrder: { findUnique: (...a: unknown[]) => orderFindUnique(...a) },
    $transaction: (fn: (t: unknown) => unknown) => fn(tx),
  },
}));

import { getCurrentUser } from "@/lib/auth";
import { saveImageFromFormData, UploadError } from "@/lib/uploads";
import { POST } from "@/app/api/gazoblok/orders/[id]/delivery-proof/route";

const loader = { id: "u1", email: "", name: "Loader", role: "SALES" as const, permissions: ["order.view", "order.edit"], isActive: true, mustChangePassword: false };
const req = () => {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "p.jpg", { type: "image/jpeg" }));
  return new NextRequest(new URL("http://localhost/api/gazoblok/orders/o1/delivery-proof"), { method: "POST", body: fd });
};
const ctx = { params: { id: "o1" } };

beforeEach(() => {
  for (const f of [queryRaw, orderFindUnique, orderUpdate, eventCreate]) f.mockReset();
  vi.mocked(getCurrentUser).mockResolvedValue(loader);
  vi.mocked(saveImageFromFormData).mockReset();
  vi.mocked(saveImageFromFormData).mockResolvedValue({ url: "/uploads/gazoblok/orders/o1/delivery-1.jpg", filename: "delivery-1.jpg", size: 4, mime: "image/jpeg" });
  orderFindUnique.mockResolvedValue({ id: "o1", status: "IN_PRODUCTION" });
  orderUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "o1", ...data }));
});

describe("POST /api/gazoblok/orders/[id]/delivery-proof", () => {
  it("saves the photo under gazoblok/orders/<id>, stamps the order and logs who and when", async () => {
    const res = await POST(req(), ctx);
    expect(res.status).toBe(200);
    const data = (await res.json()).data;
    expect(data.deliveryProofUrl).toBe("/uploads/gazoblok/orders/o1/delivery-1.jpg");
    expect(typeof data.deliveryProofUploadedAt).toBe("string");
    expect(vi.mocked(saveImageFromFormData).mock.calls[0][1]).toBe("gazoblok/orders/o1");
    expect(queryRaw).toHaveBeenCalled();
    expect(eventCreate.mock.calls[0][0].data).toMatchObject({
      orderId: "o1",
      type: "DELIVERY_PROOF",
      actorId: "u1",
      message: "Етказиш сурати юкланди",
    });
  });

  it("needs order.edit", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ ...loader, permissions: ["order.view"] });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(403);
    expect(saveImageFromFormData).not.toHaveBeenCalled();
  });

  it("404 for an unknown order", async () => {
    orderFindUnique.mockResolvedValue(null);
    expect((await POST(req(), ctx)).status).toBe(404);
  });

  it("refuses a canceled order before saving anything", async () => {
    orderFindUnique.mockResolvedValue({ id: "o1", status: "CANCELED" });
    const res = await POST(req(), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/^Бекор қилинган буюртмага сурат/);
    expect(saveImageFromFormData).not.toHaveBeenCalled();
    expect(orderUpdate).not.toHaveBeenCalled();
  });

  it("refuses when the order is canceled while the photo uploads", async () => {
    orderFindUnique.mockResolvedValueOnce({ id: "o1", status: "PLACED" }).mockResolvedValueOnce({ id: "o1", status: "CANCELED" });
    expect((await POST(req(), ctx)).status).toBe(409);
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(eventCreate).not.toHaveBeenCalled();
  });

  it("answers the upload check's refusal (type / size)", async () => {
    vi.mocked(saveImageFromFormData).mockRejectedValue(new UploadError("Расм жуда катта (мак. 8 МБ) · Image is too large (max 8 MB)", 413));
    expect((await POST(req(), ctx)).status).toBe(413);
    expect(orderUpdate).not.toHaveBeenCalled();
  });
});
