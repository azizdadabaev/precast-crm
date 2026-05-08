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
  "PLACED",
  "IN_PRODUCTION",
  "DELIVERED",
  "PAID",
  "CANCELED",
]);
export const PaymentStatusEnum = z.enum(["PAID", "PARTIAL", "UNPAID"]);
export const RoleEnum = z.enum(["ADMIN", "SALES", "ENGINEER"]);

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
});

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

// ── Payments ────────────────────────────────────────────────────
export const PaymentCreateSchema = z.object({
  dealId: z.string().min(1),
  amount: z.coerce.number().positive(),
  status: PaymentStatusEnum.default("UNPAID"),
  method: z.string().max(80).optional().nullable(),
  reference: z.string().max(120).optional().nullable(),
  paidAt: z.coerce.date().optional().nullable(),
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
