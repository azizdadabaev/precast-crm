import { describe, it, expect } from "vitest";
import {
  PlaceGazoblokOrderSchema,
  GazoblokOrderActionSchema,
  GazoblokStockAdjustSchema,
  GazoblokProductionSchema,
  GazoblokEditOrderSchema,
} from "./gazoblok-validation";

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

describe("GazoblokStockAdjustSchema", () => {
  it("rejects change of 0", () => {
    expect(GazoblokStockAdjustSchema.safeParse({ productId: "p1", change: 0 }).success).toBe(false);
  });
  it("accepts a negative change", () => {
    expect(GazoblokStockAdjustSchema.safeParse({ productId: "p1", change: -5 }).success).toBe(true);
  });
});

describe("GazoblokProductionSchema producedAt", () => {
  it("rejects a future date", () => {
    const tomorrow = new Date(Date.now() + 86_400_000);
    expect(GazoblokProductionSchema.safeParse({
      lines: [{ productId: "p1", quantity: 5 }], producedAt: tomorrow,
    }).success).toBe(false);
  });
  it("accepts a past date", () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    expect(GazoblokProductionSchema.safeParse({
      lines: [{ productId: "p1", quantity: 5 }], producedAt: yesterday,
    }).success).toBe(true);
  });
  it("accepts an omitted producedAt", () => {
    expect(GazoblokProductionSchema.safeParse({
      lines: [{ productId: "p1", quantity: 5 }],
    }).success).toBe(true);
  });
});

describe("GazoblokEditOrderSchema (stage 3 edit contract)", () => {
  it("rejects an empty edit", () => {
    expect(GazoblokEditOrderSchema.safeParse({}).success).toBe(false);
  });
  it("accepts clearing the date only", () => {
    expect(GazoblokEditOrderSchema.safeParse({ scheduledAt: null }).success).toBe(true);
  });
  it("rejects a zero quantity line", () => {
    expect(GazoblokEditOrderSchema.safeParse({ lines: [{ productId: "p", quantity: 0 }] }).success).toBe(false);
  });
});

describe("reorder link and refund notes", () => {
  it("PlaceGazoblokOrderSchema keeps sourceOrderId", () => {
    const r = PlaceGazoblokOrderSchema.safeParse({ ...baseOrder, sourceOrderId: "o1" });
    expect(r.success && r.data.sourceOrderId).toBe("o1");
  });
  const refund = (extra: object) =>
    GazoblokOrderActionSchema.safeParse({ action: "record_refund", amount: 500_000, method: "CASH", ...extra });
  it("record_refund without notes fails", () => {
    expect(refund({}).success).toBe(false);
  });
  it("record_refund with a reason passes", () => {
    expect(refund({ notes: "Ортиқча тўлов" }).success).toBe(true);
  });
});
