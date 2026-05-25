export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { EditOrderSchema } from "@/lib/validation";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { calculateSlab, type Pattern } from "@/services/calculation-engine";
import { loadPricingConfig } from "@/lib/pricing-config";
import { calcResultToCreatePayload } from "@/lib/calc-persistence";

/**
 * PATCH /api/orders/[id]/edit  (order.edit)
 *
 * Replaces a placed order's calculation snapshot + pricing knobs.
 * Mirrors the Place Order POST handler's engine flow but skips the
 * client/deal/order-number bootstrap (those are fixed for an
 * existing order).
 *
 * Status policy (per the operator decision recorded in HANDOFF.md):
 *   - PLACED, IN_PRODUCTION : edit allowed
 *   - DISPATCHED, DELIVERED, CANCELED : forbidden
 *
 * Payment policy: existing Payment rows are PRESERVED. The route
 * recomputes `confirmedPaid` from the still-CONFIRMED payments and
 * sets `paymentState` accordingly against the new `totalPrice`. If
 * the new total is below `confirmedPaid`, the order ends up
 * FULLY_PAID with confirmedPaid > totalPrice (overpayment) — owners
 * resolve refunds out-of-band; this route never auto-rejects or
 * auto-refunds. If the new total is above, the existing pending
 * payments stay PENDING; the maker-checker flow handles confirm.
 *
 * Audit: appends an ORDER_EDITED event with a JSON diff of the
 * pricing-snapshot fields so the Activity log shows the change
 * alongside placement, dispatch, etc.
 */
export const PATCH = withPermission<{ id: string }>(
  "order.edit",
  async (req: NextRequest, { user, params }) => {
    const body = EditOrderSchema.parse(await req.json());

    const orderId = params.id;
    const existing = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        project: { include: { calculations: true } },
        payments: { select: { status: true, amount: true } },
      },
    });
    if (!existing) return fail("Order not found", 404);
    if (existing.status === "DISPATCHED" || existing.status === "DELIVERED" || existing.status === "CANCELED") {
      return fail(
        `Order in status ${existing.status} cannot be edited. Use Cancel + recreate instead.`,
        422,
      );
    }

    // Compute every room up-front (mirrors POST /api/orders).
    // Edits re-price against the CURRENT pricing config — the user
    // chose to edit the order, so the new totals reflect the latest
    // tier table. The pre-edit snapshot stays in the Activity log
    // via the ORDER_EDITED event payload below.
    const pricing = await loadPricingConfig();
    const computed = body.rooms.map((room) => ({
      input: room,
      result: calculateSlab(
        {
          inner_width: room.innerWidth,
          inner_length: room.innerLength,
          bearing: room.bearing,
          correction: room.correction,
          extra_beams: room.extraBeams,
          force_start_beam: room.forceStartBeam,
          pattern: (room.patternOverride ?? undefined) as Pattern | undefined,
        },
        pricing,
      ),
    }));

    const roomsSubtotal = computed.reduce(
      (s, c) => s + Number(calcResultToCreatePayload(c.input, c.result).subtotal),
      0,
    );
    const totalArea = computed.reduce((s, c) => s + c.result.monolith_area, 0);
    const totalBlocks = computed.reduce((s, c) => s + c.result.total_blocks, 0);
    const totalBeams = computed.reduce((s, c) => s + c.result.beam_count, 0);
    // Same precedence rule as POST /api/orders: explicit amount wins
    // over percent. Amount capped at subtotal.
    let discountAmount: number;
    let resolvedDiscountPercent: number;
    if (body.discountAmount > 0) {
      discountAmount = Math.min(body.discountAmount, roomsSubtotal);
      resolvedDiscountPercent =
        roomsSubtotal > 0
          ? Math.round((discountAmount / roomsSubtotal) * 10000) / 100
          : 0;
    } else {
      resolvedDiscountPercent = body.discountPercent;
      discountAmount = roomsSubtotal * (resolvedDiscountPercent / 100);
    }
    const newTotal = roomsSubtotal - discountAmount + body.deliveryCost + body.otherCost;

    // Recompute confirmedPaid + paymentState against the new total.
    // Authoritative aggregation from the existing payments table —
    // never trust a stale denormalized field.
    const confirmedPaid = existing.payments
      .filter((p) => p.status === "CONFIRMED")
      .reduce((s, p) => s + Number(p.amount), 0);
    const newPaymentState =
      confirmedPaid >= newTotal && newTotal > 0
        ? "FULLY_PAID"
        : confirmedPaid > 0
          ? "PARTIALLY_PAID"
          : "AWAITING_PAYMENT";

    // Pricing-snapshot diff for the audit event. Decimal columns come
    // back as strings via Prisma; cast through Number for the diff so
    // the JSON in the OrderEvent reads cleanly.
    const oldSnapshot = {
      roomsSubtotal: Number(existing.roomsSubtotal),
      discountPercent: Number(existing.discountPercent),
      discountAmount: Number(existing.discountAmount),
      deliveryCost: Number(existing.deliveryCost),
      otherCost: Number(existing.otherCost),
      totalPrice: Number(existing.totalPrice),
      totalArea: Number(existing.totalArea),
      totalBlocks: existing.totalBlocks,
      totalBeams: existing.totalBeams,
      scheduledAt: existing.scheduledAt.toISOString(),
      roomsCount: existing.project.calculations.length,
    };
    const newSnapshot = {
      roomsSubtotal,
      discountPercent: resolvedDiscountPercent,
      discountAmount,
      deliveryCost: body.deliveryCost,
      otherCost: body.otherCost,
      totalPrice: newTotal,
      totalArea,
      totalBlocks,
      totalBeams,
      scheduledAt: body.scheduledAt.toISOString(),
      roomsCount: computed.length,
    };

    const updated = await prisma.$transaction(async (tx) => {
      // Replace the project's calculations with the freshly-computed ones.
      await tx.calculation.deleteMany({ where: { projectId: existing.projectId } });
      await tx.calculation.createMany({
        data: computed.map((c) => ({
          projectId: existing.projectId,
          ...calcResultToCreatePayload(c.input, c.result),
        })),
      });
      const refreshed = await tx.project.findUniqueOrThrow({
        where: { id: existing.projectId },
        include: { calculations: { orderBy: { createdAt: "asc" } } },
      });
      const primaryCalc = refreshed.calculations[0];

      const o = await tx.order.update({
        where: { id: existing.id },
        data: {
          roomsSubtotal,
          discountPercent: resolvedDiscountPercent,
          discountAmount,
          deliveryCost: body.deliveryCost,
          otherCost: body.otherCost,
          totalPrice: newTotal,
          totalArea,
          totalBlocks,
          totalBeams,
          scheduledAt: body.scheduledAt,
          notes: body.notes ?? null,
          primaryCalculationId: primaryCalc?.id ?? null,
          // Recompute the denormalized aggregate + state. paidAt only
          // flips upward — never clear it because of an edit.
          confirmedPaid,
          paymentState: newPaymentState,
          ...(existing.paidAt === null && newPaymentState === "FULLY_PAID"
            ? { paidAt: new Date() }
            : {}),
        },
      });

      await tx.orderEvent.create({
        data: {
          orderId: existing.id,
          type: "ORDER_EDITED",
          actorId: user.id,
          message: `Order edited: total ${oldSnapshot.totalPrice.toFixed(0)} → ${newTotal.toFixed(0)} (${computed.length} rooms)`,
          payload: {
            before: oldSnapshot,
            after: newSnapshot,
          },
        },
      });

      // Date change earns its own event for symmetry with the regular
      // PATCH path that also stamps SCHEDULED_DATE_CHANGED. Helps the
      // Activity log read consistently.
      if (existing.scheduledAt.getTime() !== body.scheduledAt.getTime()) {
        await tx.orderEvent.create({
          data: {
            orderId: existing.id,
            type: "SCHEDULED_DATE_CHANGED",
            actorId: user.id,
            message: `Schedule moved: ${existing.scheduledAt.toISOString()} → ${body.scheduledAt.toISOString()}`,
            payload: {
              from: existing.scheduledAt.toISOString(),
              to: body.scheduledAt.toISOString(),
            },
          },
        });
      }

      return o;
    });

    recordAudit({
      userId: user.id,
      action: "order.edit",
      targetType: "order",
      targetId: existing.id,
      message: `Edited ${existing.orderNumber}`,
      metadata: {
        orderNumber: existing.orderNumber,
        previousTotal: existing.totalPrice,
        nextTotal: updated.totalPrice,
        previousScheduledAt: existing.scheduledAt,
        nextScheduledAt: updated.scheduledAt,
        roomCount: body.rooms.length,
      },
    });

    return ok(updated);
  },
);
