import { describe, it, expect } from "vitest";
import { PlaceGazoblokOrderSchema, GazoblokOrderActionSchema } from "./gazoblok-validation";

const baseOrder = {
  clientName: "Тест",
  clientPhone: "+998901234567",
  lines: [{ productId: "p1", quantity: 10 }],
};

describe("PlaceGazoblokOrderSchema payment coupling", () => {
  it("rejects paidAmount > 0 without paymentMethod", () => {
    const r = PlaceGazoblokOrderSchema.safeParse({ ...baseOrder, paidAmount: 5_000_000 });
    expect(r.success).toBe(false);
  });
  it("accepts paidAmount > 0 with paymentMethod", () => {
    const r = PlaceGazoblokOrderSchema.safeParse({
      ...baseOrder, paidAmount: 5_000_000, paymentMethod: "CASH",
    });
    expect(r.success).toBe(true);
  });
  it("accepts paidAmount 0 without method", () => {
    expect(PlaceGazoblokOrderSchema.safeParse(baseOrder).success).toBe(true);
  });
});

describe("record_payment receiptUrls prefix", () => {
  const rec = (urls: string[]) =>
    GazoblokOrderActionSchema.safeParse({
      action: "record_payment", amount: 100_000, method: "CASH", receiptUrls: urls,
    });
  it("accepts urls minted by the gazoblok uploader", () => {
    expect(rec(["/uploads/receipts/gazoblok/u1/abc.jpg"]).success).toBe(true);
  });
  it("rejects external urls", () => {
    expect(rec(["https://attacker.example/pixel.png"]).success).toBe(false);
  });
  it("rejects other modules' upload paths", () => {
    expect(rec(["/uploads/inbox/conv1/img.jpg"]).success).toBe(false);
  });
});
