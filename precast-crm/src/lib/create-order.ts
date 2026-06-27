// createOrder — the order-placement service.
//
// Extracted (behavior-preserving) from the inline POST /api/orders handler so
// order placement can run WITHOUT a user session: the human UI route calls it
// with the logged-in user as the actor, and the (later, Plan 08) AI-agent
// approval webhook will call it with a service-account actor (userId = null) to
// commit an approved PendingOrder through this same battle-tested path.
//
// The route keeps the two checks that genuinely need the HTTP session — the
// `payment.record` 403 gate and the `inbox.access` conversationId strip — plus
// an early phone check that preserves the original failure ordering. Everything
// else (compute → atomic transaction → audit → notifications) lives here.

import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { PlaceOrderSchema } from "@/lib/validation";
import { recordAudit } from "@/lib/audit";
import { emitNotifications, usersWithPermission } from "@/lib/notifications";
import { loadPricingConfig } from "@/lib/pricing-config";
import { calcResultToCreatePayload } from "@/lib/calc-persistence";
import { normalizePhone } from "@/lib/phone";
import { nextOrderNumber, orderNumberMonthPrefix } from "@/lib/order-number";
import { computeOrderTotals } from "@/lib/order-totals";

export interface OrderActor {
  /** Stamped on OrderEvent.actorId, AuditLog.userId, and (only when
   *  paidAmount > 0) Payment.recordedById. null = AI-agent / approval
   *  service-account path. All three columns are nullable EXCEPT
   *  Payment.recordedById — which is only written when paidAmount > 0, a
   *  human-route-only path where actor.userId is always non-null. */
  userId: string | null;
  /** True when the actor holds `payment.confirm` (owner/admin) — the confirming
   *  authority. Mirrors POST /api/payments: their own up-front payment recorded
   *  at placement is CONFIRMED immediately, not left PENDING. Defaults to false
   *  (operators, AI-agent / approval service-account). */
  autoConfirmPayment?: boolean;
}

export type CreateOrderInput = z.infer<typeof PlaceOrderSchema>;

export type OrderWithClientProject = Prisma.OrderGetPayload<{
  include: { client: true; project: true };
}>;

export type CreateOrderErrorCode =
  | "PHONE_REQUIRED"
  | "PAID_AMOUNT_EXCEEDS_TOTAL"
  | "PROJECT_NOT_FOUND"
  | "PROJECT_ALREADY_ORDERED";

export interface CreateOrderError {
  code: CreateOrderErrorCode;
  /** The exact bilingual message + HTTP status the route returns today, so the
   *  route can map a failure straight to its existing `fail(...)` response. */
  message: string;
  status: number;
  details?: unknown;
}

export type CreateOrderResult =
  | { ok: true; order: OrderWithClientProject }
  | { ok: false; error: CreateOrderError };

function err(
  code: CreateOrderErrorCode,
  message: string,
  status: number,
  details?: unknown,
): { ok: false; error: CreateOrderError } {
  return { ok: false, error: { code, message, status, details } };
}

/**
 * Place an order atomically. Behavior is identical to the pre-extraction route
 * handler; failures are returned as a discriminated result (rather than thrown)
 * so both the route and the agent path can branch on them. The order is
 * returned with its `client` + `project` included.
 */
export async function createOrder(
  input: CreateOrderInput,
  actor: OrderActor,
): Promise<CreateOrderResult> {
  const phoneNorm = normalizePhone(input.clientPhone);
  if (!phoneNorm) return err("PHONE_REQUIRED", "phone is required", 422);

  const paidAmount = input.paidAmount ?? 0;

  // Compute every room up-front so we have totals for the snapshot. The current
  // pricing config is read once here and threaded into the engine so the
  // placement price reflects whatever the owner configured most recently.
  const pricing = await loadPricingConfig();
  const {
    computed,
    roomsSubtotal,
    totalArea,
    totalBlocks,
    totalBeams,
    discountAmount,
    resolvedDiscountPercent,
    totalPrice,
  } = computeOrderTotals(input.rooms, input, pricing);

  if (paidAmount > totalPrice) {
    return err(
      "PAID_AMOUNT_EXCEEDS_TOTAL",
      `paidAmount (${paidAmount}) cannot exceed totalPrice (${totalPrice})`,
      422,
    );
  }

  const placedAt = new Date();

  // Owner/admin (holds payment.confirm) is the confirming authority, so an
  // up-front payment they record AT PLACEMENT is auto-confirmed — mirroring the
  // POST /api/payments behaviour. Operators / AI-agent leave it PENDING.
  const autoConfirmInitialPayment =
    paidAmount > 0 && !!input.paymentMethod && actor.autoConfirmPayment === true;
  const paymentFullyCovers = autoConfirmInitialPayment && paidAmount >= totalPrice;
  const year = placedAt.getFullYear();
  const month = placedAt.getMonth() + 1;
  const monthPrefix = orderNumberMonthPrefix(year, month);

  // Friendly guard before opening a transaction: if the caller is trying to
  // place an order against a project that ALREADY has one, the @unique on
  // Order.projectId would otherwise throw a bare P2002. We mirror the
  // save-project route which already blocks reusing an ORDERED project. The
  // check stays cheap (one indexed lookup) and the @unique remains the true
  // safety net for the race window (re-checked inside the transaction).
  if (input.projectId) {
    const existingProject = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { id: true, status: true },
    });
    if (!existingProject) {
      return err("PROJECT_NOT_FOUND", "Лойиҳа топилмади · Project not found", 404);
    }
    if (existingProject.status === "ORDERED") {
      const existingOrder = await prisma.order.findUnique({
        where: { projectId: input.projectId },
        select: { id: true, orderNumber: true },
      });
      return err(
        "PROJECT_ALREADY_ORDERED",
        `Бу лойиҳа учун буюртма аллақачон жойлаштирилган (№${existingOrder?.orderNumber ?? "?"}) · An order has already been placed for this project (#${existingOrder?.orderNumber ?? "?"})`,
        409,
        {
          existingOrderId: existingOrder?.id ?? null,
          existingOrderNumber: existingOrder?.orderNumber ?? null,
        },
      );
    }
  }

  const order = await prisma.$transaction(async (tx) => {
    // 1. Resolve or create Client
    let client = await tx.client.findUnique({ where: { phone: phoneNorm } });
    if (!client) {
      client = await tx.client.create({
        data: {
          name: input.clientName,
          phone: phoneNorm,
          address: input.clientAddress,
        },
      });
    } else {
      const updates: Record<string, unknown> = {};
      if (client.name !== input.clientName) updates.name = input.clientName;
      if (client.address !== input.clientAddress) updates.address = input.clientAddress;
      if (Object.keys(updates).length) {
        client = await tx.client.update({ where: { id: client.id }, data: updates });
      }
    }

    // 2. Resolve or create Project + its Calculations
    let project;
    if (input.projectId) {
      project = await tx.project.findUnique({
        where: { id: input.projectId },
        include: { calculations: true },
      });
      if (!project) throw new Error("PROJECT_NOT_FOUND");
      await tx.calculation.deleteMany({ where: { projectId: project.id } });
      await tx.calculation.createMany({
        data: computed.map((c, i) => ({
          projectId: project!.id,
          seq: i,
          ...calcResultToCreatePayload(c.input, c.result),
        })),
      });
    } else {
      project = await tx.project.create({
        data: {
          clientId: client.id,
          name: null,
          shapeType: input.shapeType,
          dimensions: input.dimensions ?? {
            width: input.rooms[0].innerWidth,
            length: input.rooms[0].innerLength,
            notes: `${input.rooms.length} rooms`,
          },
          calculations: {
            create: computed.map((c, i) => ({
              ...calcResultToCreatePayload(c.input, c.result),
              seq: i,
            })),
          },
        },
        include: { calculations: true },
      });
    }

    const projectWithCalcs = await tx.project.findUniqueOrThrow({
      where: { id: project.id },
      include: { calculations: { orderBy: { seq: "asc" } } },
    });

    // 3. Allocate the next order number for this month
    const highest = await tx.order.findFirst({
      where: { orderNumber: { startsWith: monthPrefix } },
      orderBy: { orderNumber: "desc" },
      select: { orderNumber: true },
    });
    const orderNumber = nextOrderNumber(year, month, highest?.orderNumber ?? null);

    // 4. Find/create Deal for this client + advance to WON
    let deal = await tx.deal.findFirst({
      where: { clientId: client.id, status: "OPEN" },
      orderBy: { createdAt: "desc" },
    });
    if (!deal) {
      deal = await tx.deal.create({
        data: { clientId: client.id, stage: "WON", status: "WON", value: totalPrice },
      });
    } else {
      deal = await tx.deal.update({
        where: { id: deal.id },
        data: { stage: "WON", status: "WON", value: totalPrice },
      });
    }

    // 5. Update Project
    const updatedProject = await tx.project.update({
      where: { id: projectWithCalcs.id },
      data: {
        status: "ORDERED",
        clientId: client.id,
        dealId: deal.id,
        tentativeClientName: null,
        tentativeClientPhone: null,
        tentativeClientAddress: null,
      },
    });

    // 6. Create the Order
    const primaryCalc = projectWithCalcs.calculations[0];
    const createdOrder = await tx.order.create({
      data: {
        orderNumber,
        projectId: updatedProject.id,
        clientId: client.id,
        primaryCalculationId: primaryCalc?.id ?? null,
        status: "PLACED",
        roomsSubtotal,
        discountPercent: resolvedDiscountPercent,
        discountAmount,
        deliveryCost: input.deliveryCost,
        otherCost: input.otherCost,
        totalPrice,
        totalArea,
        totalBlocks,
        totalBeams,
        scheduledAt: input.scheduledAt,
        placedAt,
        notes: input.notes ?? null,
        // When the owner's up-front payment auto-confirms, the order's denormalized
        // payment aggregate must reflect it (otherwise it'd read AWAITING with a
        // CONFIRMED payment). Non-auto-confirm keeps the schema defaults.
        ...(autoConfirmInitialPayment
          ? {
              confirmedPaid: paidAmount,
              paymentState: paymentFullyCovers ? "FULLY_PAID" : "PARTIALLY_PAID",
              ...(paymentFullyCovers ? { paidAt: placedAt } : {}),
            }
          : {}),
        // Carry the source project's delivery pin (Phase 2) onto the order.
        // When placed from inline rooms (no source draft) these stay null.
        deliveryLat: projectWithCalcs.deliveryLat,
        deliveryLng: projectWithCalcs.deliveryLng,
        deliveryLocationUrl: projectWithCalcs.deliveryLocationUrl,
        deliveryLocationLabel: projectWithCalcs.deliveryLocationLabel,
      },
      include: {
        client: true,
        project: true,
      },
    });

    // 7. Activity log
    await tx.orderEvent.create({
      data: {
        orderId: createdOrder.id,
        type: "ORDER_PLACED",
        actorId: actor.userId,
        message: `Order placed for ${client.name}`,
        payload: {
          totalPrice,
          totalArea,
          scheduledAt: input.scheduledAt.toISOString(),
        },
      },
    });

    // 8. Up-front payment, if any. (Payment.recordedById is non-nullable, so
    //    this path requires a real user — only ever reached on the route.)
    if (paidAmount > 0 && input.paymentMethod) {
      const payment = await tx.payment.create({
        data: {
          orderId: createdOrder.id,
          amount: paidAmount,
          method: input.paymentMethod,
          status: autoConfirmInitialPayment ? "CONFIRMED" : "PENDING_CONFIRMATION",
          recordedById: actor.userId as string,
          recordedAt: new Date(),
          collectedById: null,
          collectedAt: null,
          // Owner-recorded payment is its own confirming authority.
          ...(autoConfirmInitialPayment
            ? { confirmedById: actor.userId as string, confirmedAt: new Date() }
            : {}),
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: createdOrder.id,
          type: "PAYMENT_RECORDED",
          actorId: actor.userId,
          message: autoConfirmInitialPayment
            ? `Payment of ${paidAmount} recorded + auto-confirmed at placement (${input.paymentMethod}).`
            : `Payment of ${paidAmount} recorded at placement (${input.paymentMethod}). Awaiting confirmation.`,
          payload: {
            paymentId: payment.id,
            amount: paidAmount,
            method: input.paymentMethod,
            recordedAtPlacement: true,
            autoConfirmed: autoConfirmInitialPayment,
          },
        },
      });
      if (input.receiptUrls?.length) {
        await tx.receipt.createMany({
          data: input.receiptUrls.map((url) => ({
            orderId: createdOrder.id,
            paymentId: payment.id,
            imageUrl: url,
            source: "CRM_UPLOAD" as const,
            uploadedById: actor.userId,
          })),
        });
      }
    }

    return createdOrder;
  });

  recordAudit({
    userId: actor.userId,
    action: "order.place",
    targetType: "order",
    targetId: order.id,
    message: `Placed order ${order.orderNumber}`,
    metadata: {
      orderNumber: order.orderNumber,
      totalPrice: order.totalPrice,
      roomCount: input.rooms.length,
    },
  });

  void (async () => {
    const userIds = await usersWithPermission("payment.confirm");
    void emitNotifications({
      type: "ORDER_PLACED",
      userIds,
      title: `Янги буюртма №${order.orderNumber} · New order #${order.orderNumber}`,
      body: order.client?.name ?? null,
      orderId: order.id,
    });
  })();

  return { ok: true, order };
}
