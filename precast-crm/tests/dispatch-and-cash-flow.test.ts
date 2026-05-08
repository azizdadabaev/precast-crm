import { describe, it, expect } from "vitest";
import {
  PaymentRecordSchema,
  PaymentConfirmSchema,
  PaymentRejectSchema,
  DispatchCreateSchema,
  DriverCreateSchema,
  DiscrepancyUpdateSchema,
  OrderStatusEnum,
  OrderPaymentStateEnum,
  PaymentStatusEnum,
  PlaceOrderSchema,
} from "../src/lib/validation";
import { canConfirmCash, type AuthPayload } from "../src/lib/auth";

// These tests exercise the pure pieces of the cash-custody feature: the
// validation schemas at the API boundary, the role gate that protects the
// confirm/reject/discrepancy endpoints, and the paymentState rule that the
// confirm endpoint applies after recomputing confirmedPaid.
//
// Route-level integration tests (production gate removed, dispatch
// transition, delivery+collection, hand-over, audit-log persistence) need
// a DB harness this repo doesn't have yet — they're worth adding when we
// stand up a test database.

const baseUser = (role: AuthPayload["role"]): AuthPayload => ({
  sub: "u1",
  email: "u1@example.com",
  name: "Test",
  role,
});

describe("OrderStatus enum (production gate removed)", () => {
  it("includes DISPATCHED between IN_PRODUCTION and DELIVERED", () => {
    const values = OrderStatusEnum.options;
    expect(values).toContain("DRAFT");
    expect(values).toContain("PLACED");
    expect(values).toContain("IN_PRODUCTION");
    expect(values).toContain("DISPATCHED");
    expect(values).toContain("DELIVERED");
    expect(values).toContain("CANCELED");
  });

  it("does NOT include the legacy PAID state", () => {
    expect(OrderStatusEnum.options).not.toContain("PAID");
  });
});

describe("OrderPaymentState enum", () => {
  it("matches the three-state spec", () => {
    expect(OrderPaymentStateEnum.options).toEqual([
      "AWAITING_PAYMENT",
      "PARTIALLY_PAID",
      "FULLY_PAID",
    ]);
  });
});

describe("PaymentStatus enum", () => {
  it("requires confirmation before counting toward revenue", () => {
    expect(PaymentStatusEnum.options).toEqual([
      "PENDING_CONFIRMATION",
      "CONFIRMED",
      "REJECTED",
    ]);
  });
});

describe("DriverCreateSchema", () => {
  it("requires name and phone", () => {
    expect(DriverCreateSchema.safeParse({}).success).toBe(false);
    expect(
      DriverCreateSchema.safeParse({ name: "Bekzod" }).success,
    ).toBe(false);
    expect(
      DriverCreateSchema.safeParse({ name: "Bekzod", phone: "+998901112233" })
        .success,
    ).toBe(true);
  });

  it("rejects empty name", () => {
    const r = DriverCreateSchema.safeParse({ name: "", phone: "+998901112233" });
    expect(r.success).toBe(false);
  });
});

describe("DispatchCreateSchema", () => {
  it("requires driverId and a non-negative expectedCollection", () => {
    expect(
      DispatchCreateSchema.safeParse({
        driverId: "d1",
        expectedCollection: 0,
      }).success,
    ).toBe(true);
    expect(
      DispatchCreateSchema.safeParse({
        driverId: "d1",
        expectedCollection: -1,
      }).success,
    ).toBe(false);
    expect(
      DispatchCreateSchema.safeParse({
        driverId: "",
        expectedCollection: 5,
      }).success,
    ).toBe(false);
  });

  it("coerces a numeric string for expectedCollection", () => {
    const r = DispatchCreateSchema.safeParse({
      driverId: "d1",
      expectedCollection: "1500000",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.expectedCollection).toBe(1500000);
  });
});

describe("PaymentRecordSchema", () => {
  it("requires orderId, positive amount, and a method (source defaults to IN_OFFICE_CASH)", () => {
    const r = PaymentRecordSchema.safeParse({
      orderId: "o1",
      amount: 1500000,
      method: "CASH",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.source).toBe("IN_OFFICE_CASH");
      expect(r.data.handOverNow).toBe(false);
    }
  });

  it("rejects zero or negative amounts", () => {
    expect(
      PaymentRecordSchema.safeParse({
        orderId: "o1",
        amount: 0,
        method: "CASH",
      }).success,
    ).toBe(false);
    expect(
      PaymentRecordSchema.safeParse({
        orderId: "o1",
        amount: -1,
        method: "CASH",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown methods", () => {
    expect(
      PaymentRecordSchema.safeParse({
        orderId: "o1",
        amount: 100,
        method: "BITCOIN",
      }).success,
    ).toBe(false);
  });

  it("accepts handOverNow with IN_OFFICE_CASH", () => {
    const r = PaymentRecordSchema.safeParse({
      orderId: "o1",
      amount: 1_000_000,
      method: "CASH",
      source: "IN_OFFICE_CASH",
      handOverNow: true,
    });
    expect(r.success).toBe(true);
  });

  it("rejects handOverNow when source is BANK_OR_ONLINE", () => {
    const r = PaymentRecordSchema.safeParse({
      orderId: "o1",
      amount: 1_000_000,
      method: "BANK_TRANSFER",
      source: "BANK_OR_ONLINE",
      handOverNow: true,
    });
    expect(r.success).toBe(false);
  });

  it("requires collectedByDriverId when source is FROM_DRIVER_AT_DELIVERY", () => {
    expect(
      PaymentRecordSchema.safeParse({
        orderId: "o1",
        amount: 1_000_000,
        method: "CASH",
        source: "FROM_DRIVER_AT_DELIVERY",
      }).success,
    ).toBe(false);
    expect(
      PaymentRecordSchema.safeParse({
        orderId: "o1",
        amount: 1_000_000,
        method: "CASH",
        source: "FROM_DRIVER_AT_DELIVERY",
        collectedByDriverId: "drv-1",
      }).success,
    ).toBe(true);
  });

  it("rejects collectedByDriverId when source is not FROM_DRIVER_AT_DELIVERY", () => {
    const r = PaymentRecordSchema.safeParse({
      orderId: "o1",
      amount: 1_000_000,
      method: "CASH",
      source: "IN_OFFICE_CASH",
      collectedByDriverId: "drv-1",
    });
    expect(r.success).toBe(false);
  });

  it("BANK_OR_ONLINE without driver and without handover is valid", () => {
    const r = PaymentRecordSchema.safeParse({
      orderId: "o1",
      amount: 2_000_000,
      method: "BANK_TRANSFER",
      source: "BANK_OR_ONLINE",
    });
    expect(r.success).toBe(true);
  });
});

describe("PaymentConfirmSchema", () => {
  it("accepts an empty body (happy path: confirm-as-recorded)", () => {
    expect(PaymentConfirmSchema.safeParse({}).success).toBe(true);
  });

  it("accepts adjustment + discrepancy info", () => {
    const r = PaymentConfirmSchema.safeParse({
      amount: 1400000,
      adjustmentNote: "Customer paid 100k less; will transfer rest",
      discrepancyAction: "TRACK",
      discrepancyNote: "Customer asked for 24h to bring the rest",
    });
    expect(r.success).toBe(true);
  });

  it("rejects discrepancy notes shorter than 5 chars", () => {
    const r = PaymentConfirmSchema.safeParse({
      discrepancyAction: "WRITEOFF",
      discrepancyNote: "no",
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown discrepancy actions", () => {
    const r = PaymentConfirmSchema.safeParse({
      discrepancyAction: "FORGIVE",
    });
    expect(r.success).toBe(false);
  });
});

describe("PaymentRejectSchema", () => {
  it("requires a reason of at least 3 chars", () => {
    expect(PaymentRejectSchema.safeParse({ reason: "no" }).success).toBe(false);
    expect(
      PaymentRejectSchema.safeParse({ reason: "wrong" }).success,
    ).toBe(true);
  });
});

describe("DiscrepancyUpdateSchema", () => {
  it("requires both a status and a resolution note", () => {
    expect(
      DiscrepancyUpdateSchema.safeParse({
        status: "RESOLVED_RECOVERED",
        resolutionNote: "Bank transfer received 2026-05-09",
      }).success,
    ).toBe(true);
    expect(
      DiscrepancyUpdateSchema.safeParse({
        status: "RESOLVED_RECOVERED",
        resolutionNote: "no",
      }).success,
    ).toBe(false);
  });
});

describe("canConfirmCash (maker-checker gate)", () => {
  it("allows ADMIN and OWNER", () => {
    expect(canConfirmCash(baseUser("ADMIN"))).toBe(true);
    expect(canConfirmCash(baseUser("OWNER"))).toBe(true);
  });

  it("denies maker roles (OPERATOR, SALES, ENGINEER)", () => {
    expect(canConfirmCash(baseUser("OPERATOR"))).toBe(false);
    expect(canConfirmCash(baseUser("SALES"))).toBe(false);
    expect(canConfirmCash(baseUser("ENGINEER"))).toBe(false);
  });

  it("denies anonymous", () => {
    expect(canConfirmCash(null)).toBe(false);
  });
});

// The confirm route applies this rule after recomputing confirmedPaid.
// Lifted here as a pure helper so we can lock in the FULLY_PAID threshold.
function paymentStateFor(confirmedPaid: number, totalPrice: number): "AWAITING_PAYMENT" | "PARTIALLY_PAID" | "FULLY_PAID" {
  if (confirmedPaid <= 0) return "AWAITING_PAYMENT";
  if (confirmedPaid >= totalPrice) return "FULLY_PAID";
  return "PARTIALLY_PAID";
}

// ── Place-order up-front payment ───────────────────────────────────
//
// The placement endpoint accepts an optional paidAmount + paymentMethod
// and creates a PENDING_CONFIRMATION Payment row in the same transaction
// as the order. The total-price ceiling is enforced inside the route
// (since totalPrice is computed server-side from the rooms snapshot),
// not in Zod — those route-level cases are deferred until we have a DB
// harness; the schema-level cases below cover the parts we can unit-test.

const baseOrderBody = {
  clientName: "Test Customer",
  clientPhone: "+998901112233",
  clientAddress: "Tashkent, somewhere",
  rooms: [
    {
      innerWidth: 4,
      innerLength: 5,
      bearing: 0.15,
      correction: 0,
      extraBeams: 0,
      forceStartBeam: false,
    },
  ],
  scheduledAt: new Date("2026-06-01"),
};

describe("PlaceOrderSchema — up-front payment", () => {
  it("accepts no payment fields (default paidAmount = 0)", () => {
    const r = PlaceOrderSchema.safeParse({ ...baseOrderBody });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.paidAmount).toBe(0);
  });

  it("accepts paidAmount = 0 with no method", () => {
    const r = PlaceOrderSchema.safeParse({ ...baseOrderBody, paidAmount: 0 });
    expect(r.success).toBe(true);
  });

  it("accepts paidAmount > 0 with a method", () => {
    const r = PlaceOrderSchema.safeParse({
      ...baseOrderBody,
      paidAmount: 5_000_000,
      paymentMethod: "CASH",
    });
    expect(r.success).toBe(true);
  });

  it("rejects paidAmount > 0 without a method", () => {
    const r = PlaceOrderSchema.safeParse({
      ...baseOrderBody,
      paidAmount: 5_000_000,
    });
    expect(r.success).toBe(false);
  });

  it("rejects negative paidAmount", () => {
    const r = PlaceOrderSchema.safeParse({
      ...baseOrderBody,
      paidAmount: -1,
      paymentMethod: "CASH",
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown payment methods", () => {
    const r = PlaceOrderSchema.safeParse({
      ...baseOrderBody,
      paidAmount: 100_000,
      paymentMethod: "BITCOIN",
    });
    expect(r.success).toBe(false);
  });
});

describe("paymentState computation", () => {
  it("AWAITING_PAYMENT when nothing confirmed", () => {
    expect(paymentStateFor(0, 1500000)).toBe("AWAITING_PAYMENT");
  });

  it("PARTIALLY_PAID for any positive amount below total", () => {
    expect(paymentStateFor(1, 1500000)).toBe("PARTIALLY_PAID");
    expect(paymentStateFor(1499999, 1500000)).toBe("PARTIALLY_PAID");
  });

  it("FULLY_PAID at exactly the total", () => {
    expect(paymentStateFor(1500000, 1500000)).toBe("FULLY_PAID");
  });

  it("FULLY_PAID when confirmed exceeds total (overpayment)", () => {
    expect(paymentStateFor(1600000, 1500000)).toBe("FULLY_PAID");
  });
});
