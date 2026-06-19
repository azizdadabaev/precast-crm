// Zod schemas for the газоблок API surface. Kept in a dedicated module
// (rather than the shared validation.ts) so the new product line stays
// self-contained and easy to roll out / roll back as one unit.

import { z } from "zod";

const PaymentMethodEnum = z.enum(["CASH", "BANK_TRANSFER", "CLICK", "PAYME", "OTHER"]);

/** Catalog product create/update (dimensions in METERS, price per block). */
export const GazoblokProductInputSchema = z.object({
  label: z.string().trim().min(1).max(60),
  lengthM: z.number().positive(),
  heightM: z.number().positive(),
  thicknessM: z.number().positive(),
  pricePerBlock: z.number().nonnegative(),
  lowStockThreshold: z.number().int().nonnegative().default(50),
  active: z.boolean().default(true),
  seq: z.number().int().nonnegative().optional(),
});

/** Catalog product update — all optional, NO defaults (so a partial PATCH
 *  never silently resets active / lowStockThreshold). */
export const GazoblokProductUpdateSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  lengthM: z.number().positive().optional(),
  heightM: z.number().positive().optional(),
  thicknessM: z.number().positive().optional(),
  pricePerBlock: z.number().nonnegative().optional(),
  lowStockThreshold: z.number().int().nonnegative().optional(),
  active: z.boolean().optional(),
  seq: z.number().int().nonnegative().optional(),
});

/** Single density-grade label shown on quotes. */
export const GazoblokGradeSchema = z.object({
  grade: z.string().trim().min(1).max(20),
});

const OrderLineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
});

/** Place a new газоблок order. */
export const PlaceGazoblokOrderSchema = z.object({
  clientName: z.string().trim().min(1),
  clientPhone: z.string().trim().min(1),
  clientAddress: z.string().trim().optional(),
  lines: z.array(OrderLineSchema).min(1),
  discountPercent: z.number().min(0).max(100).default(0),
  discountAmount: z.number().min(0).default(0),
  deliveryCost: z.number().min(0).default(0),
  scheduledAt: z.coerce.date().optional(),
  notes: z.string().trim().optional(),
  // Optional up-front payment, recorded as PENDING_CONFIRMATION.
  paidAmount: z.number().min(0).default(0),
  paymentMethod: PaymentMethodEnum.optional(),
});

/** Actions on an existing order (status flow + payments). */
export const GazoblokOrderActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set_status"),
    status: z.enum(["PLACED", "IN_PRODUCTION", "DELIVERED", "CANCELED"]),
    reason: z.string().trim().optional(),
    deliveryProofUrl: z.string().trim().optional(),
  }),
  z.object({
    action: z.literal("record_payment"),
    amount: z.number().positive(),
    method: PaymentMethodEnum,
    notes: z.string().trim().optional(),
    receiptUrls: z.array(z.string()).max(20).default([]),
  }),
  z.object({
    action: z.literal("confirm_payment"),
    paymentId: z.string().min(1),
    approve: z.boolean().default(true),
    rejectionReason: z.string().trim().optional(),
  }),
]);

/** Log a day's production (one line per product). */
export const GazoblokProductionSchema = z.object({
  producedAt: z.coerce.date().optional(),
  notes: z.string().trim().optional(),
  lines: z.array(OrderLineSchema).min(1),
});

/** Manual stock correction (signed change). */
export const GazoblokStockAdjustSchema = z.object({
  productId: z.string().min(1),
  change: z.number().int(),
  note: z.string().trim().optional(),
});
