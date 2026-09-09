// OpenAPI 3.1 document for the surface the Android app consumes (spec S8).
// Request bodies come straight from the Zod schemas the routes parse, so
// the contract cannot drift from validation. Response schemas are
// declared here as loosely-typed envelopes where the route builds ad-hoc
// Prisma selects; tighten them as the Kotlin models firm up.
//
// Regenerate: npm run openapi:generate   ·   Verify in CI: npm run openapi:check

import { z } from "zod";
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import {
  LoginSchema, ChangePinSchema, DeviceRegisterSchema, ClientCreateSchema, ClientUpdateSchema,
  PlaceOrderSchema, OrderUpdateSchema, PaymentRecordSchema, PaymentConfirmSchema,
  PaymentRejectSchema, CommentCreateSchema, DriverCreateSchema, DriverUpdateSchema,
  DispatchCreateSchema, OrderStatusEnum, OrderPaymentStateEnum, PaymentStatusEnum,
  PaymentMethodEnum, RoleEnum, LanguageEnum, GalleryListSchema,
  DiscrepancyUpdateSchema, DiscrepancyStatusEnum, ContactExportSchema, SaveProjectDraftSchema,
} from "@/lib/validation";
import { CalculateBatchSchema } from "@/app/api/calculate/batch/schema";
import { DeliveryLocationBody } from "@/app/api/orders/[id]/delivery-location/schema";
import { ResolveLinkBody } from "@/app/api/geo/resolve-link/schema";

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();

registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http", scheme: "bearer", bearerFormat: "JWT",
});

const ApiError = registry.register("ApiError", z.object({
  ok: z.literal(false),
  error: z.string().describe("Bilingual 'Uzbek · English' message"),
  details: z.unknown().optional(),
}));

const Money = z.string().regex(/^-?\d+(\.\d{1,2})?$/).describe("Decimal UZS serialised as a string, e.g. \"1250000.00\"");

const Me = registry.register("Me", z.object({
  id: z.string(), email: z.string().nullable(), name: z.string(), role: RoleEnum,
  permissions: z.array(z.string()), isActive: z.boolean(), mustChangePassword: z.boolean(),
}));

const Pricing = registry.register("Pricing", z.object({
  m2PriceTiers: z.array(z.object({ max_beam_length: z.number(), price: z.number() })),
  extraBeamPriceTiers: z.array(z.object({ max_beam_length: z.number(), price: z.number() })),
  blockUnitPrice: z.number(),
  updatedAt: z.string().nullable(),
}));

const OrderListItem = registry.register("OrderListItem", z.object({
  id: z.string(), orderNumber: z.string(), status: OrderStatusEnum, paymentState: OrderPaymentStateEnum,
  totalPrice: Money, confirmedPaid: Money, totalArea: z.string(), totalBlocks: z.number(), totalBeams: z.number(),
  scheduledAt: z.string(), placedAt: z.string(),
  client: z.object({ id: z.string(), name: z.string(), phone: z.string(), address: z.string().nullable() }),
}).passthrough());

const Notification = registry.register("Notification", z.object({
  id: z.string(), type: z.string(), title: z.string(), body: z.string().nullable(),
  orderId: z.string().nullable(), paymentId: z.string().nullable(), projectId: z.string().nullable(),
  commentId: z.string().nullable(), conversationId: z.string().nullable(),
  createdAt: z.string(), readAt: z.string().nullable(),
}));

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ ok: z.literal(true), data });
}
const Any = z.object({}).passthrough();
const bearer = [{ bearerAuth: [] }];

function json<T extends z.ZodTypeAny>(schema: T) {
  return { content: { "application/json": { schema } } };
}
const errors = {
  401: { description: "No session", ...json(ApiError) },
  403: { description: "Disabled or missing permission", ...json(ApiError) },
  422: { description: "Validation failed", ...json(ApiError) },
};
const multipart = (fields: Record<string, z.ZodTypeAny>) => ({
  content: { "multipart/form-data": { schema: z.object(fields) } },
});
const File = z.string().openapi({ format: "binary" });
const idem = z.string().max(128).optional().openapi({ param: { name: "Idempotency-Key", in: "header" } });

// ── Auth ────────────────────────────────────────────────────────
registry.registerPath({ method: "post", path: "/api/auth/login", security: [], request: { body: json(LoginSchema) },
  responses: { 200: { description: "Session", ...json(envelope(z.object({ token: z.string(), user: Me.omit({ isActive: true }), redirectTo: z.string() }))) }, 401: errors[401], 403: errors[403] } });
registry.registerPath({ method: "get", path: "/api/auth/me", security: bearer, responses: { 200: { description: "Me", ...json(envelope(Me)) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/users/me/password", security: bearer, request: { body: json(ChangePinSchema) }, responses: { 200: { description: "Changed", ...json(envelope(z.object({ changed: z.literal(true) }))) }, ...errors } });
registry.registerPath({ method: "get", path: "/api/mobile/bootstrap", security: bearer, responses: { 200: { description: "Bootstrap", ...json(envelope(z.object({
  me: Me, pricing: Pricing, capacityThresholds: z.object({ low: z.number(), moderate: z.number(), heavy: z.number() }),
  regionsVersion: z.string(), minSupportedAppVersion: z.string(), serverTime: z.string() }))) }, ...errors } });
registry.registerPath({ method: "put", path: "/api/devices", security: bearer, request: { body: json(DeviceRegisterSchema) }, responses: { 200: { description: "Registered", ...json(envelope(z.object({ id: z.string(), fcmToken: z.string() }))) }, ...errors } });
registry.registerPath({ method: "delete", path: "/api/devices/{token}", security: bearer, request: { params: z.object({ token: z.string() }) }, responses: { 200: { description: "Deleted", ...json(envelope(z.object({ deleted: z.boolean() }))) }, ...errors } });
registry.registerPath({ method: "get", path: "/api/pricing", security: bearer, responses: { 200: { description: "Pricing", ...json(envelope(Pricing)) }, ...errors } });

// ── Orders ──────────────────────────────────────────────────────
registry.registerPath({ method: "get", path: "/api/orders", security: bearer,
  request: { query: z.object({ q: z.string().optional(), status: OrderStatusEnum.optional(), day: z.string().optional(), page: z.number().int().optional(), pageSize: z.number().int().max(100).optional() }) },
  responses: { 200: { description: "Page", ...json(envelope(z.object({ items: z.array(OrderListItem), total: z.number(), page: z.number(), pageSize: z.number(), totalPages: z.number() }))) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/orders", security: bearer, request: { headers: z.object({ "Idempotency-Key": idem }), body: json(PlaceOrderSchema) }, responses: { 201: { description: "Order", ...json(envelope(Any)) }, ...errors, 409: { description: "Already placed", ...json(ApiError) } } });
registry.registerPath({ method: "post", path: "/api/projects", security: bearer, request: { headers: z.object({ "Idempotency-Key": idem }), body: json(SaveProjectDraftSchema) }, responses: { 201: { description: "Project", ...json(envelope(Any)) }, ...errors } });
// CapacityRangeSchema (validation.ts) uses z.coerce.date() for from/to, which
// zod-to-openapi renders as an optional nullable string instead of a required
// date — worse than this hand-written object, so it's kept as-is.
registry.registerPath({ method: "get", path: "/api/orders/capacity", security: bearer, request: { query: z.object({ from: z.string(), to: z.string() }) },
  responses: { 200: { description: "Days", ...json(envelope(z.object({ days: z.array(z.object({ date: z.string(), totalArea: z.number(), totalOrders: z.number(), totalBlocks: z.number() })), thresholds: z.object({ low: z.number(), moderate: z.number(), heavy: z.number() }) }))) }, ...errors } });
registry.registerPath({ method: "get", path: "/api/orders/{id}", security: bearer, request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: "Order aggregate", ...json(envelope(Any)) }, 404: { description: "Not found", ...json(ApiError) }, ...errors } });
registry.registerPath({ method: "patch", path: "/api/orders/{id}", security: bearer, request: { params: z.object({ id: z.string() }), body: json(OrderUpdateSchema) }, responses: { 200: { description: "Order", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/orders/{id}/load", security: bearer, request: { params: z.object({ id: z.string() }), headers: z.object({ "Idempotency-Key": idem }), body: multipart({ file: File }) }, responses: { 200: { description: "Loaded", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/orders/{id}/loaded-photos", security: bearer, request: { params: z.object({ id: z.string() }), headers: z.object({ "Idempotency-Key": idem }), body: multipart({ file: File }) }, responses: { 201: { description: "Photo", ...json(envelope(z.object({ id: z.string(), url: z.string(), uploadedAt: z.string() }))) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/orders/{id}/delivery-proof", security: bearer, request: { params: z.object({ id: z.string() }), headers: z.object({ "Idempotency-Key": idem }),
  body: multipart({ file: File, cashAmount: z.string().optional(), noCashCollected: z.enum(["true", "false"]).optional(), noCashCollectedNote: z.string().optional(), driverReturned: z.enum(["true", "false"]).optional() }) },
  responses: { 200: { description: "Delivered", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/orders/{id}/shipments", security: bearer, request: { params: z.object({ id: z.string() }) }, responses: { 201: { description: "Shipment", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/orders/{id}/shipments/{sid}/load", security: bearer, request: { params: z.object({ id: z.string(), sid: z.string() }), headers: z.object({ "Idempotency-Key": idem }),
  body: multipart({ file: File, loadedBeams: z.string().describe("JSON Record<beamLength,count>"), loadedBlocks: z.string() }) }, responses: { 200: { description: "Loaded", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/orders/{id}/shipments/{sid}/dispatch", security: bearer, request: { params: z.object({ id: z.string(), sid: z.string() }),
  body: json(z.object({ driverId: z.string().optional(), truckIdentifier: z.string().optional(), driverWillCollectCash: z.boolean().optional(), cashToCollect: z.number().optional(), notes: z.string().optional() })) }, responses: { 200: { description: "Dispatched", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/orders/{id}/shipments/{sid}/deliver", security: bearer, request: { params: z.object({ id: z.string(), sid: z.string() }) }, responses: { 200: { description: "Delivered", ...json(envelope(z.object({ delivered: z.literal(true) }))) }, ...errors } });
registry.registerPath({ method: "get", path: "/api/orders/{id}/comments", security: bearer, request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: "Comments", ...json(envelope(z.array(Any))) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/orders/{id}/comments", security: bearer, request: { params: z.object({ id: z.string() }), headers: z.object({ "Idempotency-Key": idem }), body: json(CommentCreateSchema) }, responses: { 201: { description: "Comment", ...json(envelope(Any)) }, ...errors } });

// ── Payments ────────────────────────────────────────────────────
registry.registerPath({ method: "get", path: "/api/payments", security: bearer, request: { query: z.object({ orderId: z.string().optional(), status: PaymentStatusEnum.optional() }) }, responses: { 200: { description: "Payments", ...json(envelope(z.array(Any))) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/payments", security: bearer, request: { headers: z.object({ "Idempotency-Key": idem }), body: json(PaymentRecordSchema) }, responses: { 201: { description: "Payment", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/payments/{id}/confirm", security: bearer, request: { params: z.object({ id: z.string() }), body: json(PaymentConfirmSchema) }, responses: { 200: { description: "Confirmed", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/payments/{id}/reject", security: bearer, request: { params: z.object({ id: z.string() }), body: json(PaymentRejectSchema) }, responses: { 200: { description: "Rejected", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/payments/upload-receipt", security: bearer, request: { headers: z.object({ "Idempotency-Key": idem }), body: multipart({ file: File }) }, responses: { 200: { description: "Stored", ...json(envelope(z.object({ url: z.string() }))) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/payments/{id}/receipts", security: bearer, request: { params: z.object({ id: z.string() }), headers: z.object({ "Idempotency-Key": idem }), body: multipart({ file: File }) }, responses: { 200: { description: "Receipt", ...json(envelope(z.object({ id: z.string(), imageUrl: z.string() }))) }, ...errors } });
registry.registerPath({ method: "get", path: "/api/discrepancies", security: bearer, request: { query: z.object({ status: DiscrepancyStatusEnum.optional() }) }, responses: { 200: { description: "Discrepancies", ...json(envelope(z.array(Any))) }, ...errors } });
registry.registerPath({ method: "patch", path: "/api/discrepancies/{id}", security: bearer, request: { params: z.object({ id: z.string() }), body: json(DiscrepancyUpdateSchema) }, responses: { 200: { description: "Updated", ...json(envelope(Any)) }, ...errors } });

// ── Clients / drivers / notifications / gallery / calc ─────────
registry.registerPath({ method: "get", path: "/api/clients", security: bearer, request: { query: z.object({ q: z.string().optional(), phone: z.string().optional(), language: LanguageEnum.optional(), source: z.string().optional(), viloyat: z.string().optional(), page: z.number().int().optional(), pageSize: z.number().int().optional(), sortBy: z.string().optional(), sortDir: z.enum(["asc", "desc"]).optional() }) },
  responses: { 200: { description: "Page (when ?page given) or bare array", ...json(envelope(z.union([z.array(Any), z.object({ rows: z.array(Any), total: z.number(), page: z.number(), pageSize: z.number(), pageCount: z.number(), sources: z.array(z.string()) })]))) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/clients", security: bearer, request: { body: json(ClientCreateSchema) }, responses: { 201: { description: "Client", ...json(envelope(Any)) }, 200: { description: "Existing client (same phone)", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "get", path: "/api/clients/{id}", security: bearer, request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: "Client", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "patch", path: "/api/clients/{id}", security: bearer, request: { params: z.object({ id: z.string() }), body: json(ClientUpdateSchema) }, responses: { 200: { description: "Client", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/clients/export", security: bearer, request: { body: json(ContactExportSchema) }, responses: { 200: { description: "Formatted contacts text + exported count", ...json(envelope(z.object({ text: z.string(), exported: z.number() }))) }, ...errors } });
registry.registerPath({ method: "get", path: "/api/drivers", security: bearer, request: { query: z.object({ activeOnly: z.enum(["true", "false"]).optional() }) }, responses: { 200: { description: "Drivers", ...json(envelope(z.array(Any))) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/drivers", security: bearer, request: { body: json(DriverCreateSchema) }, responses: { 201: { description: "Driver", ...json(envelope(Any)) }, ...errors } });
registry.registerPath({ method: "get", path: "/api/notifications", security: bearer, request: { query: z.object({ limit: z.number().int().optional(), unreadOnly: z.enum(["true", "false"]).optional() }) }, responses: { 200: { description: "Feed", ...json(envelope(z.object({ items: z.array(Notification), unreadCount: z.number() }))) }, ...errors } });
registry.registerPath({ method: "patch", path: "/api/notifications/{id}", security: bearer, request: { params: z.object({ id: z.string() }) }, responses: { 200: { description: "Read", ...json(envelope(z.object({ ok: z.literal(true) }))) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/notifications/read-all", security: bearer, responses: { 200: { description: "Read all", ...json(envelope(z.object({ ok: z.literal(true) }))) }, ...errors } });
registry.registerPath({ method: "get", path: "/api/gallery", security: bearer, request: { query: GalleryListSchema },
  responses: { 200: { description: "Posts", ...json(envelope(z.object({ posts: z.array(Any), total: z.number(), photoTotal: z.number(), page: z.number(), pageSize: z.number(), pageCount: z.number() }))) }, ...errors } });
registry.registerPath({ method: "post", path: "/api/calculate/batch", security: bearer, request: { body: json(CalculateBatchSchema) }, responses: { 200: { description: "Totals", ...json(envelope(Any)) }, ...errors } });

// ── Phase 1b: logistics, drivers, location ─────────────────────
registry.registerPath({ method: "delete", path: "/api/orders/{id}/loaded-photos/{photoId}", security: bearer,
  request: { params: z.object({ id: z.string(), photoId: z.string() }) },
  responses: { 200: { description: "Deleted", ...json(envelope(z.object({ id: z.string() }))) }, 404: { description: "Photo not found", ...json(ApiError) }, ...errors } });

registry.registerPath({ method: "delete", path: "/api/orders/{id}/shipments/{sid}", security: bearer,
  request: { params: z.object({ id: z.string(), sid: z.string() }) },
  responses: { 200: { description: "Deleted", ...json(envelope(z.object({ deleted: z.literal(true) }))) }, 404: { description: "Shipment not found", ...json(ApiError) }, ...errors } });

registry.registerPath({ method: "post", path: "/api/orders/{id}/dispatch", security: bearer,
  request: { params: z.object({ id: z.string() }), body: json(DispatchCreateSchema) },
  responses: { 201: { description: "Dispatch", ...json(envelope(Any)) }, 409: { description: "Order already has a dispatch", ...json(ApiError) }, 404: { description: "Order not found", ...json(ApiError) }, ...errors } });

registry.registerPath({ method: "patch", path: "/api/dispatches/{id}/return", security: bearer,
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: "Dispatch", ...json(envelope(Any)) }, 404: { description: "Dispatch not found", ...json(ApiError) }, ...errors } });

registry.registerPath({ method: "patch", path: "/api/orders/{id}/delivery-location", security: bearer,
  request: { params: z.object({ id: z.string() }), body: json(DeliveryLocationBody) },
  responses: { 200: { description: "Pin", ...json(envelope(z.object({
    id: z.string(), deliveryLat: z.number().nullable(), deliveryLng: z.number().nullable(),
    deliveryLocationUrl: z.string().nullable(), deliveryLocationLabel: z.string().nullable(),
  }))) }, 404: { description: "Order not found", ...json(ApiError) }, ...errors } });

registry.registerPath({ method: "post", path: "/api/geo/resolve-link", security: bearer,
  request: { body: json(ResolveLinkBody) },
  responses: { 200: { description: "Coordinates", ...json(envelope(z.object({ lat: z.number(), lng: z.number() }))) }, ...errors } });

registry.registerPath({ method: "get", path: "/api/drivers/{id}", security: bearer,
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: "Driver detail", ...json(envelope(Any)) }, 404: { description: "Driver not found", ...json(ApiError) }, ...errors } });

registry.registerPath({ method: "patch", path: "/api/drivers/{id}", security: bearer,
  request: { params: z.object({ id: z.string() }), body: json(DriverUpdateSchema) },
  responses: { 200: { description: "Driver", ...json(envelope(Any)) }, 404: { description: "Driver not found", ...json(ApiError) }, ...errors } });

registry.registerPath({ method: "patch", path: "/api/drivers/{id}/deactivate", security: bearer,
  request: { params: z.object({ id: z.string() }), body: json(z.object({ active: z.boolean().optional() })) },
  responses: { 200: { description: "Driver", ...json(envelope(Any)) }, 404: { description: "Driver not found", ...json(ApiError) }, ...errors } });

registry.registerPath({ method: "post", path: "/api/payments/{id}/handover", security: bearer,
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: "Payment", ...json(envelope(Any)) }, 404: { description: "Payment not found", ...json(ApiError) }, ...errors } });

// ── Phase 1d: dashboard ──────────────────────────────────────────
// withPermissionAny(['dashboard.viewBasic', 'dashboard.view']) — either
// permission admits the caller, so this is not `security: bearer` alone
// in spirit but the same bearer auth as everywhere else; the permission
// check happens inside the handler, same as every other route here.
registry.registerPath({ method: "get", path: "/api/dashboard", security: bearer,
  responses: { 200: { description: "Dashboard payload (KPIs, trends, today's deliveries)", ...json(envelope(Any)) }, ...errors } });

// Keep these referenced so tree-shaking never drops the enum components.
registry.register("PaymentMethod", PaymentMethodEnum);

export function buildOpenApiDocument() {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: { title: "EtalonSlabs CRM API — mobile surface", version: "1.0.0" },
    servers: [{ url: "https://etalontbm.uz" }],
  });
}
