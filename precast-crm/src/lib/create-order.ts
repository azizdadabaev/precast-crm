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
          ...(input.clientReferenceConsent
            ? {
                referenceConsent: input.clientReferenceConsent,
                consentUpdatedAt: new Date(),
              }
            : {}),
        },
      });
    } else {
      const updates: Record<string, unknown> = {};
      if (client.name !== input.clientName) updates.name = input.clientName;
      if (client.address !== input.clientAddress) updates.address = input.clientAddress;
      if (
        input.clientReferenceConsent &&
        input.clientReferenceConsent !== client.referenceConsent
      ) {
        updates.referenceConsent = input.clientReferenceConsent;
        updates.consentUpdatedAt = new Date();
      }
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
          status: "PENDING_CONFIRMATION",
          recordedById: actor.userId as string,
          recordedAt: new Date(),
          collectedById: null,
          collectedAt: null,
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: createdOrder.id,
          type: "PAYMENT_RECORDED",
          actorId: actor.userId,
          message: `Payment of ${paidAmount} recorded at placement (${input.paymentMethod}). Awaiting confirmation.`,
          payload: {
            paymentId: payment.id,
            amount: paidAmount,
            method: input.paymentMethod,
            recordedAtPlacement: true,
          },
        },
      });
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
