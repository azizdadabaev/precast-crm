export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ok, created, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { withIdempotency, bodyScope } from "@/lib/idempotency";
import { can } from "@/lib/permissions";
import { paymentStateFor } from "@/lib/payment-state";
import { recordAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/phone";
import { orderTotal, lineTotal, blockVolumeM3 } from "@/services/gazoblok-engine";
import { nextGazoblokOrderNumber, gazoblokMonthPrefix } from "@/lib/gazoblok-number";
import { PlaceGazoblokOrderSchema } from "@/lib/gazoblok-validation";
import { clientNamePlan } from "@/lib/gazoblok-quantities";
import { emitNotifications, usersWithPermission } from "@/lib/notifications";
import { placedNotice, paymentPendingNotice, recipients } from "@/lib/gazoblok-notify";
import { parseOrderListQuery, orderFlags } from "@/lib/gazoblok-order-filters";
import { orderListWhere, orderListExtras, reorderSourceProblem } from "@/lib/gazoblok-order-list";
import { placedText } from "@/lib/gazoblok-text";
import { paymentDecisionMessage, paymentRecordedMessage, placedLines } from "@/lib/gazoblok-event-payload";
import { formatNumber } from "@/lib/utils";

/** GET /api/gazoblok/orders — `order.view`. Query (all optional, spec §9): q (order
 *  number / client name / phone digits, partial numbers too), status, pay, flag
 *  (debt|refund|unconfirmed), seller, from/to (YYYY-MM-DD), limit (50, max 200),
 *  cursor (last row's id). Returns an array, newest first; each row adds
 *  pendingPaymentCount, loadedBlocks, unpaidOverload, refundDue. */
export const GET = withPermission("order.view", async (req: NextRequest) => {
  const query = parseOrderListQuery(new URL(req.url).searchParams);

  // Flags are money rules, not columns — resolve them over a light select of every order.
  let flaggedIds: string[] | null = null;
  if (query.flag) {
    const flag = query.flag;
    const light = await prisma.gazoblokOrder.findMany({
      select: {
        id: true,
        status: true,
        totalPrice: true,
        confirmedPaid: true,
        overshipAmount: true,
        _count: { select: { payments: { where: { status: "PENDING_CONFIRMATION" } } } },
      },
    });
    flaggedIds = light
      .filter((o) =>
        orderFlags({
          status: o.status,
          totalPrice: Number(o.totalPrice),
          confirmedPaid: Number(o.confirmedPaid),
          overshipAmount: Number(o.overshipAmount),
          pendingCount: o._count.payments,
        })[flag],
      )
      .map((o) => o.id);
  }

  const orders = await prisma.gazoblokOrder.findMany({
    where: orderListWhere(query, flaggedIds),
    orderBy: [{ placedAt: "desc" }, { id: "desc" }],
    take: query.limit,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    include: {
      client: { select: { id: true, name: true, phone: true } },
      lines: true,
      payments: { where: { status: "PENDING_CONFIRMATION" }, select: { id: true } },
      shipments: { select: { loadedLines: true } },
    },
  });
  // Expose only counts and sums — raw payments and shipments stay server-side.
  return ok(orders.map(({ payments, shipments, ...rest }) => ({
    ...rest,
    pendingPaymentCount: payments.length,
    ...orderListExtras({
      status: rest.status,
      totalPrice: Number(rest.totalPrice),
      confirmedPaid: Number(rest.confirmedPaid),
      overshipAmount: Number(rest.overshipAmount),
      shipments,
    }),
  })));
});

/**
 * Two concurrent placements can read the same max orderNumber and collide on
 * its unique constraint (P2002). Retry once — the number is re-read inside the
 * transaction, so the second attempt picks the next free number.
 */
async function createWithRetry<T>(create: () => Promise<T>): Promise<T> {
  try {
    return await create();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return await create();
    }
    throw e;
  }
}

/**
 * POST /api/gazoblok/orders — `order.create`. Atomic:
 *   1. Resolve/create the Client (dedup by normalized phone)
 *   2. Snapshot each line's product label + unit price + quantity
 *   3. Allocate "B-YYYY-MM-NNNN" for the month
 *   4. Create the order + lines + ORDER_PLACED event (a reorder links its source)
 *   5. Optional up-front payment (PENDING_CONFIRMATION, or CONFIRMED for payment.confirm)
 *      with its optional receipt photos (payment.record, like the upload route)
 * Stock is NOT touched here — it moves per truck when blocks are loaded.
 * A network retry must not place the order (with its payment and receipts) twice: the
 * web form sends one Idempotency-Key per form state, pinned to the body; no header = old behaviour.
 */
export const POST = withPermission("order.create", withIdempotency(async (req: NextRequest, { user }) => {
  const body = PlaceGazoblokOrderSchema.parse(await req.json());

  // A receipt is a payment record: same gate as the upload route and record_payment.
  if (body.receiptUrls.length && !can(user, "payment.record")) {
    return fail("Тўлов ёзишга рухсат йўқ · You can't record payments", 403);
  }

  const phoneNorm = normalizePhone(body.clientPhone);
  if (!phoneNorm) return fail("Телефон рақами керак · Phone is required", 422);

  const productIds = Array.from(new Set(body.lines.map((l) => l.productId)));
  // Archived sizes can't be ordered at their stale price.
  const products = await prisma.gazoblokProduct.findMany({ where: { id: { in: productIds }, active: true } });
  const byId = new Map(products.map((p) => [p.id, p]));
  for (const l of body.lines) {
    if (!byId.has(l.productId)) {
      return fail(`Маҳсулот топилмади · Product not found: ${l.productId}`, 422);
    }
  }

  const lineRows = body.lines.map((l) => {
    const p = byId.get(l.productId)!;
    const unit = Number(p.pricePerBlock);
    const volEach = blockVolumeM3({
      lengthM: Number(p.lengthM),
      heightM: Number(p.heightM),
      thicknessM: Number(p.thicknessM),
      pricePerBlock: unit,
    });
    return {
      productId: p.id,
      productLabel: p.label,
      unitPrice: unit,
      quantity: l.quantity,
      lineTotal: lineTotal(unit, l.quantity),
      volume: volEach * l.quantity,
    };
  });

  const totals = orderTotal(
    lineRows.map((r) => ({ unitPrice: r.unitPrice, quantity: r.quantity })),
    {
      discountPercent: body.discountPercent,
      discountAmount: body.discountAmount,
      deliveryCost: body.deliveryCost,
    },
  );
  const totalVolumeM3 = Math.round(lineRows.reduce((s, r) => s + r.volume, 0) * 1000) / 1000;

  const paidAmount = body.paidAmount ?? 0;
  if (paidAmount > totals.total) {
    return fail(
      `Тўлов жамидан кўп бўлолмайди: ${formatNumber(paidAmount, 2)} > ${formatNumber(totals.total, 2)} UZS · Payment cannot exceed the total`,
      422,
    );
  }

  const placedAt = new Date();
  const year = placedAt.getFullYear();
  const month = placedAt.getMonth() + 1;
  const monthPrefix = gazoblokMonthPrefix(year, month);

  // A reorder must come from an existing order of this same client.
  let reorderOf: string | null = null;
  if (body.sourceOrderId) {
    const source = await prisma.gazoblokOrder.findUnique({
      where: { id: body.sourceOrderId },
      select: { orderNumber: true, client: { select: { phone: true } } },
    });
    const problem = reorderSourceProblem(source, phoneNorm);
    if (problem) return fail(problem.message, problem.status);
    reorderOf = source!.orderNumber;
  }

  // Never rename an existing client silently — ask the operator first.
  const known = await prisma.client.findUnique({ where: { phone: phoneNorm }, select: { name: true } });
  if (known && clientNamePlan(known.name, body.clientName, body.clientNameDecision) === "ask") {
    return fail(
      `Бу рақам «${known.name}» номи билан сақланган · This phone is saved under «${known.name}»`,
      409,
      { code: "CLIENT_NAME_MISMATCH", savedName: known.name, typedName: body.clientName },
    );
  }

  const order = await createWithRetry(() => prisma.$transaction(async (tx) => {
    // 1. Resolve or create Client (same dedup posture as the floor order route)
    let client = await tx.client.findUnique({ where: { phone: phoneNorm } });
    if (!client) {
      client = await tx.client.create({
        data: { name: body.clientName, phone: phoneNorm, address: body.clientAddress ?? null },
      });
    } else {
      const updates: { name?: string; address?: string } = {};
      if (clientNamePlan(client.name, body.clientName, body.clientNameDecision) === "update") updates.name = body.clientName;
      if (body.clientAddress && client.address !== body.clientAddress) {
        updates.address = body.clientAddress;
      }
      if (Object.keys(updates).length) {
        client = await tx.client.update({ where: { id: client.id }, data: updates });
      }
    }

    // 2. Allocate the next order number for the month
    const highest = await tx.gazoblokOrder.findFirst({
      where: { orderNumber: { startsWith: monthPrefix } },
      orderBy: { orderNumber: "desc" },
      select: { orderNumber: true },
    });
    const orderNumber = nextGazoblokOrderNumber(year, month, highest?.orderNumber ?? null);

    // 3. Create the order with its lines + placed event
    const createdOrder = await tx.gazoblokOrder.create({
      data: {
        orderNumber,
        clientId: client.id,
        // Selling operator — the owner asks them about unpaid over-load.
        createdById: user.id,
        sourceOrderId: body.sourceOrderId ?? null,
        status: "PLACED",
        linesSubtotal: totals.linesSubtotal,
        discountPercent: totals.discountPercent,
        discountAmount: totals.discountAmount,
        deliveryCost: totals.deliveryCost,
        totalPrice: totals.total,
        totalBlocks: totals.totalBlocks,
        totalVolumeM3,
        scheduledAt: body.scheduledAt ?? null,
        placedAt,
        notes: body.notes ?? null,
        wallEstimate: (body.wallEstimate as Prisma.InputJsonValue) ?? undefined,
        lines: {
          create: lineRows.map((r) => ({
            productId: r.productId,
            productLabel: r.productLabel,
            unitPrice: r.unitPrice,
            quantity: r.quantity,
            lineTotal: r.lineTotal,
          })),
        },
        events: {
          create: {
            type: "ORDER_PLACED",
            actorId: user.id,
            message: placedText(client.name, reorderOf),
            payload: {
              totalPrice: totals.total,
              totalBlocks: totals.totalBlocks,
              lines: placedLines(lineRows),
              ...(reorderOf ? { reorderOf } : {}),
            },
          },
        },
      },
      include: { client: true, lines: true },
    });

    // 4. Optional up-front payment. A recorder with payment.confirm is the
    //    confirming authority — their payment lands CONFIRMED in one step.
    if (paidAmount > 0 && body.paymentMethod) {
      const autoConfirm = can(user, "payment.confirm");
      const now = new Date();
      const p = await tx.gazoblokPayment.create({
        data: {
          orderId: createdOrder.id,
          amount: paidAmount,
          method: body.paymentMethod,
          status: autoConfirm ? "CONFIRMED" : "PENDING_CONFIRMATION",
          ...(autoConfirm ? { confirmedById: user.id, confirmedAt: now } : {}),
          recordedById: user.id,
        },
      });
      await tx.gazoblokOrderEvent.create({
        data: {
          orderId: createdOrder.id,
          type: "PAYMENT_RECORDED",
          actorId: user.id,
          message: paymentRecordedMessage({ amount: paidAmount, method: body.paymentMethod, receipts: body.receiptUrls.length }),
          payload: { paymentId: p.id, amount: paidAmount, method: body.paymentMethod, receipts: body.receiptUrls.length, atPlacement: true },
        },
      });
      if (body.receiptUrls.length) {
        await tx.gazoblokReceipt.createMany({
          data: body.receiptUrls.map((url) => ({
            orderId: createdOrder.id,
            paymentId: p.id,
            imageUrl: url,
            source: "CRM_UPLOAD" as const,
            uploadedById: user.id,
          })),
        });
      }
      if (autoConfirm) {
        const paymentState = paymentStateFor(paidAmount, 0, totals.total);
        const updatedOrder = await tx.gazoblokOrder.update({
          where: { id: createdOrder.id },
          data: { confirmedPaid: paidAmount, paymentState },
          include: { client: true, lines: true },
        });
        await tx.gazoblokOrderEvent.create({
          data: {
            orderId: createdOrder.id,
            type: "PAYMENT_CONFIRMED",
            actorId: user.id,
            message: paymentDecisionMessage({ approve: true, amount: paidAmount, method: body.paymentMethod, auto: true }),
            payload: { paymentId: p.id, amount: paidAmount, method: body.paymentMethod, autoConfirmed: true },
          },
        });
        return updatedOrder;
      }
    }

    return createdOrder;
  }));

  recordAudit({
    userId: user.id,
    action: "gazoblok.order.place",
    targetType: "gazoblok_order",
    targetId: order.id,
    message: `Placed газоблок order ${order.orderNumber}`,
    metadata: { orderNumber: order.orderNumber, totalPrice: totals.total },
  });

  // Bell notices after commit; a failure here must never fail the placement.
  void (async () => {
    try {
      const to = recipients(await usersWithPermission("payment.confirm"), user.id);
      await emitNotifications({
        ...placedNotice({ id: order.id, orderNumber: order.orderNumber, clientName: order.client.name }),
        userIds: to,
      });
      const pending = await prisma.gazoblokPayment.findFirst({
        where: { orderId: order.id, status: "PENDING_CONFIRMATION" },
        select: { id: true, amount: true, method: true },
      });
      if (pending) {
        await emitNotifications({
          ...paymentPendingNotice(order, { id: pending.id, amount: Number(pending.amount), method: pending.method }),
          userIds: to,
        });
      }
    } catch (err) {
      console.error("[gazoblok] placement notices failed:", err);
    }
  })();

  return created(order);
}, { scope: bodyScope }));
