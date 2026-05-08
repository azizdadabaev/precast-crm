import { z } from "zod";

// ── Enums ───────────────────────────────────────────────────────
export const LanguageEnum = z.enum(["UZ", "RU"]);
export const DealStageEnum = z.enum([
  "NEW_LEAD",
  "CONTACTED",
  "CALCULATION",
  "QUOTE_SENT",
  "WON",
  "LOST",
]);
export const DealStatusEnum = z.enum(["OPEN", "WON", "LOST"]);
export const ShapeTypeEnum = z.enum(["RECTANGULAR", "TRAPEZOIDAL", "IRREGULAR"]);
export const LayoutPatternEnum = z.enum(["GB", "BGB", "GBG"]);
export const ProjectStatusEnum = z.enum(["DRAFT", "ORDERED", "ARCHIVED"]);
export const OrderStatusEnum = z.enum([
  "DRAFT",
  "PLACED",
  "IN_PRODUCTION",
  "DISPATCHED",
  "DELIVERED",
  "CANCELED",
]);
export const OrderPaymentStateEnum = z.enum([
  "AWAITING_PAYMENT",
  "PARTIALLY_PAID",
  "FULLY_PAID",
]);
export const PaymentStatusEnum = z.enum([
  "PENDING_CONFIRMATION",
  "CONFIRMED",
  "REJECTED",
]);
export const PaymentMethodEnum = z.enum([
  "CASH",
  "BANK_TRANSFER",
  "CLICK",
  "PAYME",
  "OTHER",
]);
export const DiscrepancyStatusEnum = z.enum([
  "OPEN",
  "RESOLVED_RECOVERED",
  "RESOLVED_DISCOUNT",
  "RESOLVED_WRITEOFF",
  "DISPUTED",
]);
export const RoleEnum = z.enum(["ADMIN", "SALES", "ENGINEER", "OPERATOR", "OWNER"]);

// ── Auth ────────────────────────────────────────────────────────
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const RegisterSchema = LoginSchema.extend({
  name: z.string().min(2),
  role: RoleEnum.default("SALES"),
});

// ── Clients ─────────────────────────────────────────────────────
export const ReferenceConsentEnum = z.enum(["NOT_ASKED", "GRANTED", "DENIED"]);

export const ClientCreateSchema = z.object({
  name: z.string().min(1, "name is required").max(120),
  phone: z.string().min(5).max(40), // raw input; normalized at handler
  address: z.string().max(200).optional().nullable(),
  language: LanguageEnum.default("UZ"),
  source: z.string().max(80).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const ClientUpdateSchema = ClientCreateSchema.partial().extend({
  // Consent fields aren't part of Create (operators set them after the
  // initial conversation), but Update accepts them.
  referenceConsent: ReferenceConsentEnum.optional(),
  consentNote: z.string().max(500).optional().nullable(),
});

// ── Contact export (privacy-gated) ──────────────────────────────
// Capped at 50 to prevent accidental "export everyone" with a buggy
// script. The endpoint also enforces the GRANTED-consent gate
// server-side regardless of what the client sends.
export const ContactExportSchema = z.object({
  ids: z.array(z.string()).min(1).max(50),
});

// ── Deals ───────────────────────────────────────────────────────
export const DealCreateSchema = z.object({
  clientId: z.string().min(1),
  stage: DealStageEnum.default("NEW_LEAD"),
  value: z.coerce.number().min(0).default(0),
  assignedToId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const DealUpdateSchema = z.object({
  stage: DealStageEnum.optional(),
  status: DealStatusEnum.optional(),
  value: z.coerce.number().min(0).optional(),
  assignedToId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// ── Calculations / rooms ────────────────────────────────────────
export const ProjectDimensionsSchema = z.object({
  width: z.coerce.number().positive(),
  length: z.coerce.number().positive(),
  widths: z.array(z.coerce.number().positive()).optional(),
  notes: z.string().max(500).optional().nullable(),
});

export const RoomCalcInputSchema = z.object({
  name: z.string().max(80).optional().nullable(),
  innerWidth: z.coerce.number().positive(),
  innerLength: z.coerce.number().positive(),
  bearing: z.coerce.number().min(0).default(0.15),
  correction: z.coerce.number().default(0),
  extraBeams: z.coerce.number().int().min(0).default(0),
  forceStartBeam: z.coerce.boolean().default(false),
  patternOverride: LayoutPatternEnum.optional().nullable(),
});

// ── Calculate API (preview) ─────────────────────────────────────
export const CalculateRequestSchema = RoomCalcInputSchema.extend({
  projectId: z.string().optional(),
});

// ── Save Project (Draft) ────────────────────────────────────────
// Phone-only is required at save time; Name + Address are optional drafts.
export const SaveProjectDraftSchema = z.object({
  projectId: z.string().optional(), // update if provided, else create
  name: z.string().max(120).optional().nullable(),
  // Tentative client info (operator hasn't committed to creating a Client yet)
  clientName: z.string().max(120).optional().nullable(),
  clientPhone: z.string().min(3, "phone is required").max(40),
  clientAddress: z.string().max(200).optional().nullable(),
  // Optional reference-consent capture during the call. Sent ONLY when the
  // operator explicitly grants consent (checkbox toggled to GRANTED) — null
  // means "leave existing consent untouched". The server never DOWNGRADES
  // from this endpoint; revoking / denying happens on the client detail page.
  clientReferenceConsent: ReferenceConsentEnum.optional().nullable(),
  shapeType: ShapeTypeEnum.default("RECTANGULAR"),
  dimensions: ProjectDimensionsSchema.optional().nullable(),
  rooms: z.array(RoomCalcInputSchema).default([]),
});

// ── Place Order (commits the deal) ──────────────────────────────
// All four required: phone + name + address + at least 1 valid room.
export const PlaceOrderSchema = z.object({
  // Source — either an existing draft project, or inline rooms+client info
  projectId: z.string().optional(),
  clientName: z.string().min(1, "client name is required").max(120),
  clientPhone: z.string().min(5, "client phone is required").max(40),
  clientAddress: z.string().min(1, "client address is required").max(200),
  // Optional reference-consent capture (see SaveProjectDraftSchema for
  // the contract). null = leave existing untouched, never downgrades.
  clientReferenceConsent: ReferenceConsentEnum.optional().nullable(),
  // When projectId is omitted, we create the project from the rooms below
  shapeType: ShapeTypeEnum.default("RECTANGULAR"),
  dimensions: ProjectDimensionsSchema.optional().nullable(),
  rooms: z.array(RoomCalcInputSchema).min(1, "at least one room is required"),
  // Pricing
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  deliveryCost: z.coerce.number().min(0).default(0),
  otherCost: z.coerce.number().min(0).default(0),
  // Required: when does the customer want delivery?
  scheduledAt: z.coerce.date(),
  notes: z.string().max(2000).optional().nullable(),
  // Optional up-front payment captured in the placement dialog. When > 0
  // the route creates a PENDING_CONFIRMATION Payment row in the same
  // transaction (recordedById = current user; collectedById = null since
  // there's no driver yet). The total-price ceiling is enforced in the
  // route handler since totalPrice is computed server-side.
  paidAmount: z.coerce.number().min(0).default(0),
  paymentMethod: PaymentMethodEnum.optional().nullable(),
}).refine(
  (v) => !(v.paidAmount > 0) || !!v.paymentMethod,
  { path: ["paymentMethod"], message: "paymentMethod is required when paidAmount > 0" },
);

// ── Cancel order ────────────────────────────────────────────────
// Either ADMIN role (no password) or password supplied. Server enforces.
export const CancelOrderSchema = z.object({
  reason: z.string().max(500).optional().nullable(),
  password: z.string().optional().nullable(),
});

// ── Update order status / scheduled date ───────────────────────
export const OrderUpdateSchema = z.object({
  status: OrderStatusEnum.optional(),
  scheduledAt: z.coerce.date().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

// ── Drivers ─────────────────────────────────────────────────────
export const DriverCreateSchema = z.object({
  name: z.string().min(2, "name is required").max(120),
  phone: z.string().min(5).max(40), // raw input; normalized in handler
  notes: z.string().max(500).optional().nullable(),
});

export const DriverUpdateSchema = DriverCreateSchema.partial();

// ── Dispatches ──────────────────────────────────────────────────
// Operators set expectedCollection based on what the driver should
// actually collect — discounts at this point are not enforced; the
// owner adjudicates discrepancies later when confirming payment.
export const DispatchCreateSchema = z.object({
  driverId: z.string().min(1, "driver is required"),
  truckIdentifier: z.string().max(40).optional().nullable(),
  expectedCollection: z.coerce.number().min(0, "cannot be negative"),
  notes: z.string().max(500).optional().nullable(),
});

// ── Payments ────────────────────────────────────────────────────
// Recording a payment (any role). Three real entry points:
//   - At placement (in-office cash or bank/online before delivery)
//   - Mid-order via the Add Payment dialog on the order detail page
//   - At delivery (driver collected on site)
// All three land here via /api/payments. recordedById comes from the
// auth cookie. The shape that ends up in the DB depends on `source`:
//   IN_OFFICE_CASH         → no driver; handedOverToOfficeAt set if
//                             handOverNow=true (operator passes to owner)
//   BANK_OR_ONLINE         → no driver, no handover step at all
//   FROM_DRIVER_AT_DELIVERY → collectedByDriverId required, collectedAt
//                             stamped server-side
export const PaymentSourceEnum = z.enum([
  "IN_OFFICE_CASH",
  "BANK_OR_ONLINE",
  "FROM_DRIVER_AT_DELIVERY",
]);

export const PaymentRecordSchema = z
  .object({
    orderId: z.string().min(1),
    amount: z.coerce.number().positive(),
    method: PaymentMethodEnum,
    source: PaymentSourceEnum.default("IN_OFFICE_CASH"),
    handOverNow: z.boolean().default(false),
    collectedByDriverId: z.string().optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
  })
  .refine(
    (d) => !(d.source === "FROM_DRIVER_AT_DELIVERY" && !d.collectedByDriverId),
    { path: ["collectedByDriverId"], message: "Driver is required when source is FROM_DRIVER_AT_DELIVERY" },
  )
  .refine(
    (d) => !(d.source !== "FROM_DRIVER_AT_DELIVERY" && d.collectedByDriverId),
    { path: ["collectedByDriverId"], message: "Driver should only be set when source is FROM_DRIVER_AT_DELIVERY" },
  )
  .refine(
    (d) => !(d.source === "BANK_OR_ONLINE" && d.handOverNow),
    { path: ["handOverNow"], message: "Bank/online payments cannot have a hand-over step" },
  );

// Confirm a Pending payment. Owner-only. The body is empty for the
// happy path (matching expected); if the confirmer adjusts the amount,
// adjustmentNote is required. If the recorded amount is below the
// dispatch's expectedCollection, discrepancyAction + discrepancyNote
// are required (the route enforces this contextually since it depends
// on the linked dispatch).
export const PaymentConfirmSchema = z.object({
  amount: z.coerce.number().positive().optional(),
  adjustmentNote: z.string().max(500).optional().nullable(),
  discrepancyAction: z.enum(["TRACK", "DISCOUNT", "WRITEOFF"]).optional(),
  discrepancyNote: z.string().min(5, "note must be at least 5 chars").max(500).optional(),
});

export const PaymentRejectSchema = z.object({
  reason: z.string().min(3, "reason is required").max(500),
});

// ── Discrepancies ───────────────────────────────────────────────
export const DiscrepancyUpdateSchema = z.object({
  status: DiscrepancyStatusEnum,
  resolutionNote: z.string().min(5, "note must be at least 5 chars").max(500),
});

// ── Capacity calendar ───────────────────────────────────────────
export const CapacityRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

// ── Inventory / Production ──────────────────────────────────────
export const InventoryKindEnum = z.enum(["BEAM", "BLOCK"]);

const ProductionLineSchema = z
  .object({
    kind: InventoryKindEnum,
    beamLength: z.coerce.number().positive().optional().nullable(),
    quantity: z.coerce.number().int().positive(),
  })
  .superRefine((line, ctx) => {
    if (line.kind === "BEAM" && (line.beamLength == null || line.beamLength <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["beamLength"],
        message: "beamLength is required for BEAM lines",
      });
    }
  });

export const ProductionEntryCreateSchema = z.object({
  producedAt: z.coerce.date().optional(),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(ProductionLineSchema).min(1, "at least one line is required"),
});

export const InventoryUpdateSchema = z.object({
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
});

export const InventoryAdjustmentSchema = z.object({
  delta: z.coerce.number().int().refine((n) => n !== 0, "delta cannot be zero"),
  note: z.string().min(3, "note is required").max(500),
});
