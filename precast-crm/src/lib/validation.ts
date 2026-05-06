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
export const QuoteStatusEnum = z.enum(["DRAFT", "SENT", "ACCEPTED", "REJECTED"]);
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
export const ClientCreateSchema = z.object({
  name: z.string().min(1, "name is required").max(120),
  phone: z.string().min(5).max(40),
  location: z.string().max(200).optional().nullable(),
  language: LanguageEnum.default("UZ"),
  source: z.string().max(80).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const ClientUpdateSchema = ClientCreateSchema.partial();

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

// ── Projects ────────────────────────────────────────────────────
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

export const ProjectCreateSchema = z.object({
  dealId: z.string().min(1),
  name: z.string().max(120).optional().nullable(),
  shapeType: ShapeTypeEnum.default("RECTANGULAR"),
  dimensions: ProjectDimensionsSchema,
  rooms: z.array(RoomCalcInputSchema).min(1),
});

// ── One-shot calculate (preview, optional persist) ──────────────
export const CalculateRequestSchema = RoomCalcInputSchema.extend({
  projectId: z.string().optional(), // when set, persist the result
});

// ── Quotes ──────────────────────────────────────────────────────
export const QuoteCreateSchema = z.object({
  projectId: z.string().min(1),
  calculationId: z.string().optional().nullable(),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  deliveryCost: z.coerce.number().min(0).default(0),
  otherCost: z.coerce.number().min(0).default(0),
  status: QuoteStatusEnum.default("DRAFT"),
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
