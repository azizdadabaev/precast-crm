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

// Receipt URLs must point at files the gazoblok uploader actually mints
// (see /api/gazoblok/upload-receipt → saveBufferToUploads('receipts/gazoblok/<userId>')).
/** No "..", backslashes or encoded dots: a URL must not climb out of its folder. */
const staysInFolder = (u: string) => !/(\.\.|\\|%2e|%5c)/i.test(u);

export const GazoblokUploadUrl = z.string().refine(
  (u) => u.startsWith("/uploads/receipts/gazoblok/") && staysInFolder(u),
  { message: "Нотўғри файл манзили · Invalid receipt URL" },
);

// Delivery proofs may also be shipment photos saved under /uploads/gazoblok/orders/<id>/.
const GazoblokDeliveryProofUrl = z.string().refine(
  (u) => (u.startsWith("/uploads/receipts/gazoblok/") || u.startsWith("/uploads/gazoblok/")) && staysInFolder(u),
  { message: "Нотўғри файл манзили · Invalid proof URL" },
);

const OpeningSnapshotSchema = z.object({
  kind: z.enum(["DOOR", "WINDOW", "OTHER"]),
  widthM: z.number().positive(),
  heightM: z.number().positive(),
  qty: z.number().int().min(1),
});
const WallSnapshotSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().optional(),
  lengthM: z.number().positive(),
  heightM: z.number().positive(),
  productId: z.string().min(1),
  orientation: z.enum(["STANDARD", "ROTATED"]).optional(),
  openings: z.array(OpeningSnapshotSchema).max(30),
});
/** Loose validation of the calculator snapshot the client sends at placement.
 *  Stored as-is for the record; NOT recomputed server-side (lines are billed). */
export const WallEstimateSnapshotSchema = z.object({
  walls: z.array(WallSnapshotSchema).max(200),
  opts: z.object({
    jointMm: z.number().min(0).optional(),
    wastePct: z.number().min(0).optional(),
    glueKgPerM2: z.number().min(0).optional(),
    glueBagKg: z.number().min(0).optional(),
  }).optional(),
  result: z.unknown().optional(),
});

/** Place a new газоблок order. */
export const PlaceGazoblokOrderSchema = z.object({
  clientName: z.string().trim().min(1),
  // When the phone belongs to a client saved under another name, the operator
  // decides: keep the saved name or update it (never a silent rename).
  clientNameDecision: z.enum(["keep", "update"]).optional(),
  clientPhone: z.string().trim().min(1),
  clientAddress: z.string().trim().optional(),
  lines: z.array(OrderLineSchema).min(1),
  discountPercent: z.number().min(0).max(100).default(0),
  discountAmount: z.number().min(0).default(0),
  deliveryCost: z.number().min(0).default(0),
  scheduledAt: z.coerce.date().optional(),
  notes: z.string().trim().optional(),
  // Optional up-front payment (auto-confirmed when the recorder can confirm).
  paidAmount: z.number().min(0).default(0),
  paymentMethod: PaymentMethodEnum.optional(),
  wallEstimate: WallEstimateSnapshotSchema.optional(),
  // Reorder: the past order this one was copied from (link only, nothing else is copied).
  sourceOrderId: z.string().min(1).optional(),
}).refine((b) => b.paidAmount === 0 || !!b.paymentMethod, {
  message: "Тўлов усулини танланг · Payment method is required when an amount is paid",
  path: ["paymentMethod"],
});

/** Actions on an existing order (status flow + payments). */
export const GazoblokOrderActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set_status"),
    status: z.enum(["PLACED", "IN_PRODUCTION", "DELIVERED", "CANCELED"]),
    reason: z.string().trim().optional(),
    deliveryProofUrl: GazoblokDeliveryProofUrl.optional(),
  }),
  z.object({
    action: z.literal("record_payment"),
    amount: z.number().positive(),
    method: PaymentMethodEnum,
    notes: z.string().trim().optional(),
    receiptUrls: z.array(GazoblokUploadUrl).max(20).default([]),
  }),
  z.object({
    action: z.literal("confirm_payment"),
    paymentId: z.string().min(1),
    approve: z.boolean().default(true),
    rejectionReason: z.string().trim().optional(),
  }),
  // The client stopped before taking everything: bill what was loaded (renovation 2026-11).
  z.object({
    action: z.literal("close_short"),
    reason: z.string().trim().min(3).max(500),
  }),
  // Money back to the client (negative confirmed payment), like beam-and-block.
  z.object({
    action: z.literal("record_refund"),
    amount: z.number().positive(),
    method: PaymentMethodEnum,
    // Money leaving the business needs a stated reason.
    notes: z.string().trim().min(5).max(500),
  }),
]);

const EditLineSchema = z.object({
  lineId: z.string().min(1).optional(),
  productId: z.string().min(1),
  quantity: z.number().int().min(1),
});

/** Edit / reschedule an open order. Every field optional; at least one present.
 *  Lines, discount and delivery are "money" edits; date and notes alone are a reschedule. */
export const GazoblokEditOrderSchema = z.object({
  lines: z.array(EditLineSchema).min(1).max(50).optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  discountAmount: z.number().min(0).optional(),
  deliveryCost: z.number().min(0).optional(),
  scheduledAt: z.coerce.date().nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
}).refine((b) => Object.values(b).some((v) => v !== undefined), {
  message: "Ўзгариш йўқ · Nothing to change",
});
export type GazoblokEditOrderInput = z.infer<typeof GazoblokEditOrderSchema>;

/** Log a day's production (one line per product). */
export const GazoblokProductionSchema = z.object({
  // Bound checked per-request via .refine — z.date().max(new Date(...)) would
  // freeze the cutoff at module-load time. 5 min of clock-skew tolerance.
  producedAt: z.coerce.date()
    .refine((d) => d.getTime() <= Date.now() + 5 * 60_000, {
      message: "Келажак санаси мумкин эмас · Future date not allowed",
    })
    .optional(),
  notes: z.string().trim().optional(),
  lines: z.array(OrderLineSchema).min(1),
});

/** Void a production entry (reverses its stock additions). */
export const GazoblokProductionActionSchema = z.object({
  action: z.literal("void"),
  entryId: z.string().min(1),
});

/** Manual stock correction (signed change). */
export const GazoblokStockAdjustSchema = z.object({
  productId: z.string().min(1),
  change: z.number().int().refine((c) => c !== 0, {
    message: "Ўзгариш 0 бўлиши мумкин эмас · Change cannot be zero",
  }),
  note: z.string().trim().optional(),
});
