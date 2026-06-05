export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, created, fail } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/phone";
import { orderTotal, lineTotal, blockVolumeM3 } from "@/services/gazoblok-engine";
import { nextGazoblokOrderNumber, gazoblokMonthPrefix } from "@/lib/gazoblok-number";
import { PlaceGazoblokOrderSchema } from "@/lib/gazoblok-validation";

/** GET /api/gazoblok/orders — gazoblok.view. Filter by q / status. */
export const GET = withAuth(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const status = searchParams.get("status") ?? undefined;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { orderNumber: { contains: q, mode: "insensitive" } },
      { client: { name: { contains: q, mode: "insensitive" } } },
      { client: { phone: { contains: q } } },
    ];
  }

  const orders = await prisma.gazoblokOrder.findMany({
    where,
    orderBy: [{ placedAt: "desc" }],
    take: 100,
    include: {
      client: { select: { id: true, name: true, phone: true } },
      lines: true,
    },
  });
  return ok(orders);
});

/**
 * POST /api/gazoblok/orders — gazoblok.order. Atomic:
 *   1. Resolve/create the Client (dedup by normalized phone)
 *   2. Snapshot each line's product label + unit price + quantity
 *   3. Allocate "B-YYYY-MM-NNNN" for the month
 *   4. Create the order + lines + ORDER_PLACED event
 *   5. Optional up-front payment (PENDING_CONFIRMATION)
 * Stock is NOT touched here — it decrements when the order is delivered.
 */
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const body = PlaceGazoblokOrderSchema.parse(await req.json());

  const phoneNorm = normalizePhone(body.clientPhone);
  if (!phoneNorm) return fail("phone is required", 422);

  const productIds = Array.from(new Set(body.lines.map((l) => l.productId)));
  const products = await prisma.gazoblokProduct.findMany({ where: { id: { in: productIds } } });
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
    return fail(`paidAmount (${paidAmount}) cannot exceed total (${totals.total})`, 422);
  }

  const placedAt = new Date();
  const year = placedAt.getFullYear();
  const month = placedAt.getMonth() + 1;
  const monthPrefix = gazoblokMonthPrefix(year, month);

  const order = await prisma.$transaction(async (tx) => {
    // 1. Resolve or create Client (same dedup posture as the floor order route)
    let client = await tx.client.findUnique({ where: { phone: phoneNorm } });
    if (!client) {
      client = await tx.client.create({
        data: { name: body.clientName, phone: phoneNorm, address: body.clientAddress ?? null },
      });
    } else {
      const updates: { name?: string; address?: string } = {};
      if (client.name !== body.clientName) updates.name = body.clientName;
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
            message: `Order placed for ${client.name}`,
            payload: { totalPrice: totals.total, totalBlocks: totals.totalBlocks },
          },
        },
      },
      include: { client: true, lines: true },
    });

    // 4. Optional up-front payment
    if (paidAmount > 0 && body.paymentMethod) {
      await tx.gazoblokPayment.create({
        data: {
          orderId: createdOrder.id,
          amount: paidAmount,
          method: body.paymentMethod,
          status: "PENDING_CONFIRMATION",
          recordedById: user.id,
        },
      });
      await tx.gazoblokOrderEvent.create({
        data: {
          orderId: createdOrder.id,
          type: "PAYMENT_RECORDED",
          actorId: user.id,
          message: `Payment of ${paidAmount} recorded at placement (${body.paymentMethod}).`,
          payload: { amount: paidAmount, method: body.paymentMethod, atPlacement: true },
        },
      });
    }

    return createdOrder;
  });

  recordAudit({
    userId: user.id,
    action: "gazoblok.order.place",
    targetType: "gazoblok_order",
    targetId: order.id,
    message: `Placed газоблок order ${order.orderNumber}`,
    metadata: { orderNumber: order.orderNumber, totalPrice: totals.total },
  });

  return created(order);
});
