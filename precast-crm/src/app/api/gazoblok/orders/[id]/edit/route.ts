export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import { can } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { GAZOBLOK_PERMISSION } from "@/lib/gazoblok-permissions";
import { GazoblokEditOrderSchema } from "@/lib/gazoblok-validation";
import { changesText, editPlan, editPolicy, editScope, orderVolumeM3 } from "@/lib/gazoblok-edit";
import { loadedByLine } from "@/lib/gazoblok-quantities";
import { paymentStateFor } from "@/lib/payment-state";
import { refundDue } from "@/lib/overpayment";

type Tx = Prisma.TransactionClient;

/** Thrown inside the transaction; turned into a 4xx after rollback. */
class Refused extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Same row lock as the order action route: edits serialize with loads and payments. */
async function lockOrder(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM gazoblok_orders WHERE id = ${id} FOR UPDATE`;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/**
 * PATCH /api/gazoblok/orders/[id]/edit — change lines, discount, delivery, date or notes
 * of an open order (spec §4). Date/notes need order.edit; money after any block was
 * loaded needs order.editShipped. Loaded counts, prices and paid money are re-read under
 * the row lock, so an edit racing a truck load can never drop below what was loaded.
 * Stock never moves on edit.
 */
export const PATCH = withAuth<{ id: string }>(async (req: NextRequest, { user, params }) => {
  const body = GazoblokEditOrderSchema.parse(await req.json());
  const scope = editScope(body);
  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, params.id);
      const order = await tx.gazoblokOrder.findUnique({
        where: { id: params.id },
        include: {
          lines: { include: { product: { select: { lengthM: true, heightM: true, thicknessM: true } } } },
          shipments: { select: { loadedLines: true } },
        },
      });
      if (!order) throw new Refused(404, "Буюртма топилмади · Order not found");

      const totalLoaded = [...loadedByLine(order.shipments).values()].reduce((s, n) => s + n, 0);
      const refused = editPolicy({ ...order, totalLoaded }, scope, {
        edit: can(user, GAZOBLOK_PERMISSION.editOrder),
        editShipped: can(user, GAZOBLOK_PERMISSION.correctDeliveredTruck),
      });
      if (refused) throw new Refused(refused.status, refused.message);

      // Only sizes not already on the order need the catalog (new sizes take today's price).
      const onOrder = new Set(order.lines.map((l) => l.productId));
      const newIds = (body.lines ?? []).map((l) => l.productId).filter((id) => !onOrder.has(id));
      const products = newIds.length
        ? await tx.gazoblokProduct.findMany({ where: { id: { in: newIds } } })
        : [];

      const before = {
        linesSubtotal: Number(order.linesSubtotal),
        discountPercent: Number(order.discountPercent),
        discountAmount: Number(order.discountAmount),
        deliveryCost: Number(order.deliveryCost),
        overshipAmount: Number(order.overshipAmount),
        totalPrice: Number(order.totalPrice),
        scheduledAt: order.scheduledAt,
        notes: order.notes,
      };
      const plan = editPlan({
        order: before,
        lines: order.lines.map((l) => ({ ...l, unitPrice: Number(l.unitPrice) })),
        shipments: order.shipments,
        products: products.map((p) => ({
          id: p.id,
          label: p.label,
          pricePerBlock: Number(p.pricePerBlock),
          active: p.active,
          lengthM: Number(p.lengthM),
          heightM: Number(p.heightM),
          thicknessM: Number(p.thicknessM),
        })),
        edit: body,
      });
      if ("problem" in plan) throw new Refused(plan.problem.status, plan.problem.message);

      for (const u of plan.lineOps.update) {
        await tx.gazoblokOrderLine.update({ where: { id: u.id }, data: { quantity: u.quantity, lineTotal: u.lineTotal } });
      }
      if (plan.lineOps.create.length) {
        await tx.gazoblokOrderLine.createMany({ data: plan.lineOps.create.map((c) => ({ ...c, orderId: order.id })) });
      }
      if (plan.lineOps.remove.length) {
        await tx.gazoblokOrderLine.deleteMany({ where: { orderId: order.id, id: { in: plan.lineOps.remove } } });
      }
      const lines = await tx.gazoblokOrderLine.findMany({
        where: { orderId: order.id },
        select: { quantity: true, product: { select: { lengthM: true, heightM: true, thicknessM: true } } },
      });
      const totalVolumeM3 = orderVolumeM3(
        lines.map((l) => ({
          quantity: l.quantity,
          product: l.product && {
            lengthM: Number(l.product.lengthM),
            heightM: Number(l.product.heightM),
            thicknessM: Number(l.product.thicknessM),
          },
        })),
      );

      // Confirmed money (refunds are negative) as record_payment does; pending stays pending.
      const agg = await tx.gazoblokPayment.aggregate({ where: { orderId: order.id, status: "CONFIRMED" }, _sum: { amount: true } });
      const confirmedPaid = Number(agg._sum.amount ?? 0);
      const paymentState = paymentStateFor(confirmedPaid, 0, plan.totals.totalPrice);

      await tx.gazoblokOrder.update({
        where: { id: order.id },
        data: {
          ...plan.totals,
          totalVolumeM3,
          confirmedPaid,
          paymentState,
          scheduledAt: plan.scheduledAt,
          notes: plan.notes,
        },
      });

      const rescheduleOnly = scope === "schedule" && plan.changes.every((c) => c.field === "date");
      const message = changesText(plan.changes);
      await tx.gazoblokOrderEvent.create({
        data: {
          orderId: order.id,
          type: rescheduleOnly ? "ORDER_RESCHEDULED" : "ORDER_EDITED",
          actorId: user.id,
          message,
          payload: {
            before: { ...before, scheduledAt: iso(before.scheduledAt) },
            after: { ...plan.totals, scheduledAt: iso(plan.scheduledAt), notes: plan.notes },
            changes: plan.changes,
          },
        },
      });

      return {
        orderNumber: order.orderNumber,
        message,
        response: {
          id: order.id,
          totalPrice: plan.totals.totalPrice,
          paymentState,
          refundDue: refundDue({ status: order.status, totalPrice: plan.totals.totalPrice, confirmedPaid, writeOffAmount: 0 }),
        },
      };
    });

    recordAudit({
      userId: user.id,
      action: "gazoblok.order.edit",
      targetType: "gazoblok_order",
      targetId: result.response.id,
      message: `${result.orderNumber}: ${result.message}`,
    });
    return ok(result.response);
  } catch (e) {
    if (e instanceof Refused) return fail(e.message, e.status);
    throw e;
  }
});
