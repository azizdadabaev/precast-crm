import { z } from "zod";
import { M2_PRICE_TIERS } from "@/services/calculation-engine";

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
export const RoleEnum = z.enum([
  "OWNER",
  "ADMIN",
  "SALES",
  "INVENTORY",
  "DRIVER",
  "ACCOUNTANT",
  "CUSTOM",
]);

// ── Auth ────────────────────────────────────────────────────────
export const LoginSchema = z.object({
  loginName: z.string().min(1).max(120),
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
});

// ── User management ─────────────────────────────────────────────
// The permissions list is validated at the route handler — it has
// the canonical ACTIONS set and a stricter check is cheaper there
// than embedding the full enum here.
export const CreateUserSchema = z.object({
  name: z.string().min(2, "name must be at least 2 chars").max(120),
  email: z.string().email().max(120).optional(),
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
  role: RoleEnum.default("SALES"),
  permissions: z.array(z.string()).default([]),
});

// All fields optional — only the supplied ones are touched. The
// route validates each permission string against ACTIONS and gates
// permissions edits on the user.editPermissions action. Disabling
// (isActive=false) is gated on user.disable.
export const UpdateUserSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  role: RoleEnum.optional(),
  permissions: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
  // Admin can reset another user's PIN; mustChangePassword is set to true.
  resetPin: z.string().regex(/^\d{4}$/).optional(),
  // Telegram numeric user id for the receipt-forward bot. Owner-entered. Empty
  // string clears it. Digits only.
  telegramUserId: z.string().regex(/^\d{5,15}$/).or(z.literal("")).optional(),
});

// Self-service PIN change. currentPin is empty during forced-change flow.
export const ChangePinSchema = z.object({
  currentPin: z.string().optional().default(""),
  newPin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
});

// ── Clients ─────────────────────────────────────────────────────
export const ClientCreateSchema = z.object({
  name: z.string().min(1, "name is required").max(120),
  phone: z.string().min(5).max(40), // raw input; normalized at handler
  address: z.string().max(200).optional().nullable(),
  language: LanguageEnum.default("UZ"),
  source: z.string().max(80).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const ClientUpdateSchema = ClientCreateSchema.partial();

// ── Contact export ──────────────────────────────────────────────
// Capped at 50 to prevent accidental "export everyone" with a buggy
// script.
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

/**
 * Plain object form of the room input — kept as a ZodObject (no
 * refines) so consumers can still `.extend()` it. The refined version
 * lives below and is what we put in `z.array(...)` for Save Project /
 * Place Order; the override pair must be consistent there but the
 * preview /api/calculate route doesn't need that check.
 */
export const RoomCalcInputBaseSchema = z.object({
  name: z.string().max(80).optional().nullable(),
  innerWidth: z.coerce.number().positive(),
  innerLength: z.coerce.number().positive(),
  bearing: z.coerce.number().min(0).default(0.15),
  correction: z.coerce.number().default(0),
  extraBeams: z.coerce.number().int().min(0).default(0),
  forceStartBeam: z.coerce.boolean().default(false),
  patternOverride: LayoutPatternEnum.optional().nullable(),
  // Per-row rate override. Catalog-only — the operator can pick any of
  // the 5 M²-price tiers in the engine but cannot type a custom number.
  // When false, the engine's auto-pick from beam_length wins.
  m2PriceOverride: z.coerce.boolean().default(false),
  m2PriceOverrideValue: z.coerce
    .number()
    .nullable()
    .optional()
    .refine(
      (v) =>
        v === null ||
        v === undefined ||
        M2_PRICE_TIERS.some((t) => t.price === v),
      { message: "Rate must match a catalog tier" },
    ),
  m2PriceReason: z.string().max(200).nullable().optional(),
  // Stage-② room-capture annotation: the box drawn over a source drawing,
  // normalized 0..1, plus that drawing's served path. Persisted on the
  // resulting Calculation (annotationBox + annotationImagePath); the engine
  // ignores it.
  box: z
    .object({
      imagePath: z.string().max(500),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      w: z.number().min(0).max(1),
      h: z.number().min(0).max(1),
    })
    .nullable()
    .optional(),
});

/**
 * Refined room input — enforces the override pair's consistency. Use
 * this anywhere a room is being persisted or used to place an order.
 * For the read-only preview endpoint use the base schema.
 */
export const RoomCalcInputSchema = RoomCalcInputBaseSchema
  .refine(
    (d) => !(d.m2PriceOverride && d.m2PriceOverrideValue == null),
    { path: ["m2PriceOverrideValue"], message: "Override value is required when m2PriceOverride is true" },
  )
  .refine(
    (d) =>
      !(
        !d.m2PriceOverride &&
        (d.m2PriceOverrideValue != null ||
          (d.m2PriceReason != null && d.m2PriceReason !== ""))
      ),
    { path: ["m2PriceOverride"], message: "Override value/reason can only be set when m2PriceOverride is true" },
  );

// ── Calculate API (preview) ─────────────────────────────────────
// Uses the base (non-refined) schema so .extend() still works; the
// preview endpoint doesn't care about override consistency since it
// doesn't persist anything.
export const CalculateRequestSchema = RoomCalcInputBaseSchema.extend({
  projectId: z.string().optional(),
});

// ── Drawn floor plan (CAD sketch) ───────────────────────────────
// Mirrors `CalculatorDrawing` in the calculator store. Persisted as JSON on
// Project.drawingJson so reopening a saved draft restores the exact outlines.
// dirOverrides is keyed "roomIndex:bayIndex" (string on the wire).
const BeamDirEnum = z.enum(["H", "V"]);
const PtSchema = z.object({ x: z.number(), y: z.number() });
export const CalculatorDrawingSchema = z.object({
  rooms: z.array(
    z.object({
      id: z.string().optional(),
      points: z.array(PtSchema),
      closed: z.boolean(),
    }),
  ),
  globalDir: BeamDirEnum.nullable(),
  dirOverrides: z.record(z.string(), BeamDirEnum).default({}),
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
  shapeType: ShapeTypeEnum.default("RECTANGULAR"),
  dimensions: ProjectDimensionsSchema.optional().nullable(),
  rooms: z.array(RoomCalcInputSchema).default([]),
  // Grand-total discount — two mutually-exclusive modes resolved with the
  // same precedence as the engine (amount > 0 wins). Both default to 0 so
  // legacy callers that don't send a discount keep saving at full price.
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  discountAmount: z.coerce.number().min(0).default(0),
  // Link to the originating Telegram conversation. Honored only when the
  // caller has inbox.access (enforced in the route); otherwise dropped.
  conversationId: z.string().optional().nullable(),
  // Drawn room outline (CAD sketch). Persisted so reopening the draft restores
  // the exact outline. Absent → leave any existing drawing untouched; explicit
  // null → clear it; object → set it.
  drawing: CalculatorDrawingSchema.nullish(),
});

// ── Place Order (commits the deal) ──────────────────────────────
// All four required: phone + name + address + at least 1 valid room.
export const PlaceOrderSchema = z.object({
  // Source — either an existing draft project, or inline rooms+client info
  projectId: z.string().optional(),
  clientName: z.string().min(1, "client name is required").max(120),
  clientPhone: z.string().min(5, "client phone is required").max(40),
  clientAddress: z.string().min(1, "client address is required").max(200),
  // When projectId is omitted, we create the project from the rooms below
  shapeType: ShapeTypeEnum.default("RECTANGULAR"),
  dimensions: ProjectDimensionsSchema.optional().nullable(),
  rooms: z.array(RoomCalcInputSchema).min(1, "at least one room is required"),
  // Pricing — discount has two mutually-exclusive modes; the server
  // resolves them with the same precedence as the engine (amount > 0
  // wins). Both default to 0 so legacy clients that don't send
  // discountAmount keep the historical percentage-only behavior.
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  discountAmount: z.coerce.number().min(0).default(0),
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
  receiptUrls: z.array(z.string().max(500)).max(10).default([]),
}).refine(
  (v) => !(v.paidAmount > 0) || !!v.paymentMethod,
  { path: ["paymentMethod"], message: "paymentMethod is required when paidAmount > 0" },
);

// ── Edit order ──────────────────────────────────────────────────
// Post-placement modification of a placed order. Same payload shape
// as PlaceOrderSchema for the parts the engine cares about (rooms +
// pricing levers + scheduledAt + notes), but no client info (the
// order's client is locked in) and no inline up-front payment
// (existing Payment rows are preserved as-is; if the new totalPrice
// changes the paid/owed math, the maker-checker flow handles it
// out-of-band per the spec).
export const EditOrderSchema = z.object({
  rooms: z.array(RoomCalcInputSchema).min(1, "at least one room is required"),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  discountAmount: z.coerce.number().min(0).default(0),
  deliveryCost: z.coerce.number().min(0).default(0),
  otherCost: z.coerce.number().min(0).default(0),
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
  driverId: z.string().cuid().optional().nullable(),
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
    receiptUrls: z.array(z.string().max(500)).max(10).default([]),
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

// ── Tapered → calculator prefill ────────────────────────────────
// Payload encoded into the `?prefill=` query param when the sandbox's
// tapered calculator hands rooms over to the production calculator.
// Cap rooms at 50 — a 25 m tapered slab is ~43 per-row entries, so 50
// leaves headroom while preventing accidental "pump in everything".
export const TaperedPrefillRoomSchema = z.object({
  name: z.string().max(80).optional().nullable(),
  innerWidth: z.coerce.number().positive(),
  innerLength: z.coerce.number().positive(),
});

export const TaperedPrefillSchema = z.object({
  source: z.literal("tapered-sandbox"),
  mode: z.enum(["per-row", "grouped"]),
  rooms: z.array(TaperedPrefillRoomSchema).min(1).max(50),
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

// ── Comments ────────────────────────────────────────────────────
// Threaded notes attached to orders or saved drafts. Body is plain
// text; @mentions are resolved at write time on the server and stored
// as a separate ID list for fast notification fan-out.
export const CommentCreateSchema = z.object({
  body: z
    .string()
    .min(1, "Comment cannot be empty")
    .max(4000, "Comment is too long (max 4000 characters)")
    .transform((s) => s.trim())
    .refine((s) => s.length > 0, "Comment cannot be empty"),
});

export const CommentEditSchema = CommentCreateSchema;

// Unified inbox query params. Cursor-based pagination over the
// non-deleted comment stream, optionally filtered by entity type.
export const CommentInboxSchema = z.object({
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  entityType: z.enum(["order", "project"]).optional(),
});

// ── Gallery ─────────────────────────────────────────────────────
export const GalleryPhotoKindEnum = z.enum([
  "LOADED",
  "DELIVERY_PROOF",
  "SHIPMENT_LOADED",
]);

export const GalleryListSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
  kind: GalleryPhotoKindEnum.optional(),
  clientId: z.string().cuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  // Free-text search across order number, client name/phone/address.
  q: z
    .string()
    .max(120)
    .optional()
    .transform((s) => s?.trim() || undefined),
});

// ── Notifications ───────────────────────────────────────────────
// Query params for the GET /api/notifications feed.
export const NotificationListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  unreadOnly: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "true"),
});
