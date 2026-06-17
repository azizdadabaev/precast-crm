export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { SettleRemainingBody } from "./schema";

/**
 * PATCH /api/orders/[id]/settle-remaining  (payment.confirm — owner-only)
 *
 * Writes off the leftover balance on an order so it counts as fully paid.
 * The leftover (totalPrice − confirmedPaid − writeOffAmount) is added to
 * writeOffAmount, paymentState flips to FULLY_PAID, and the action is
 * logged in the order timeline with the required reason.
 *
 * Deliberate + auditable: requires a note (min 3 chars), refuses while
 * any payment is still PENDING_CONFIRMATION (don't write off money that's
 * in flight), and refuses on a canceled order.
 */
export const PATCH = withPermission<{ id: string }>(
  "payment.confirm",
  async (req: NextRequest, { user, params }) => {
    const body = SettleRemainingBody.parse(await req.json());

    const updated = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: params.id },
        select: {
          id: true,
          orderNumber: true,
          totalPrice: true,
          confirmedPaid: true,
          writeOffAmount: true,
          paymentState: true,
          status: true,
          paidAt: true,
          payments: {
            where: { status: "PENDING_CONFIRMATION" },
            select: { amount: true },
          },
        },
      });
      if (!order) return { ok: false as const, error: "Order not found", status: 404 as const };

      if (order.status === "CANCELED") {
        return { ok: false as const, error: "Cannot settle a canceled order", status: 422 as const };
      }
      if (order.payments.length > 0) {
        return {
          ok: false as const,
          error:
            "Confirm or reject pending payments first · Аввал кутилаётган тўловларни тасдиқланг/рад этинг",
          status: 422 as const,
        };
      }

      const remaining =
        Number(order.totalPrice) -
        Number(order.confirmedPaid) -
        Number(order.writeOffAmount);
      if (remaining <= 0) {
        return { ok: false as const, error: "Nothing to settle · Қолдиқ йўқ", status: 422 as const };
      }

      const note = body.note.trim();
      const now = new Date();

      const o = await tx.order.update({
        where: { id: order.id },
        data: {
          writeOffAmount: { increment: remaining },
          writeOffById: user.id,
          writeOffAt: now,
          writeOffNote: note,
          paymentState: "FULLY_PAID",
          ...(order.paidAt === null ? { paidAt: now } : {}),
        },
      });

      // Reuse DISCREPANCY_RESOLVED rather than introduce a new enum value:
      // adding an OrderEventType member needs a Postgres enum migration
      // (this change is generate-only, no db push), so inserting an
      // unmigrated value would fail at runtime in prod. The timeline
      // renders event types via a generic fallback, so this displays
      // cleanly today.
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          type: "DISCREPANCY_RESOLVED",
          actorId: user.id,
          message: `Қолдиқ ҳисобдан чиқарилди · Remaining written off: ${remaining} (${note})`,
          payload: { writtenOff: remaining, note } as Prisma.InputJsonValue,
        },
      });

      return { ok: true as const, order: o, orderNumber: order.orderNumber, remaining, note };
    });

    if (!updated.ok) return fail(updated.error, updated.status);

    recordAudit({
      userId: user.id,
      action: "payment.confirm",
      targetType: "order",
      targetId: updated.order.id,
      message: `Settled remaining on ${updated.orderNumber}: wrote off ${updated.remaining}`,
      metadata: {
        orderNumber: updated.orderNumber,
        writtenOff: updated.remaining,
        note: updated.note,
      },
    });

    return ok(updated.order);
  },
);
