import { describe, it, expect } from "vitest";
import { PaymentRecordSchema } from "@/lib/validation";

describe("PaymentRecordSchema receiptUrls", () => {
  it("accepts receiptUrls", () => {
    const r = PaymentRecordSchema.safeParse({ orderId: "o1", amount: 100, method: "BANK_TRANSFER", receiptUrls: ["/uploads/receipts/u1/a.jpg"] });
    expect(r.success).toBe(true);
  });
  it("defaults receiptUrls to []", () => {
    const r = PaymentRecordSchema.parse({ orderId: "o1", amount: 100, method: "CASH" });
    expect(r.receiptUrls).toEqual([]);
  });
  it("rejects more than 10 receipts", () => {
    const many = Array.from({ length: 11 }, (_, i) => `/uploads/receipts/u1/${i}.jpg`);
    expect(PaymentRecordSchema.safeParse({ orderId: "o1", amount: 100, method: "CASH", receiptUrls: many }).success).toBe(false);
  });
});
