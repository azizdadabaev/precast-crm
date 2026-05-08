export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { PaymentRecordSchema } from "@/lib/validation";
import { ok, fail, created, handler } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";

/**
 * GET /api/payments
 *   ?orderId=...        scope to one order
 *   ?status=PENDING_CONFIRMATION|CONFIRMED|REJECTED   filter
 *
 * Returns payments newest-first with chain-of-custody refs included so
 * the /payments confirmer page can render the chain panel without an
 * extra query.
 */
export const GET = handler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  const where: Record<string, unknown> = {};
  if (orderId) where.orderId = orderId;
  if (status) where.status = status;

  const payments = await prisma.payment.findMany({
    where,
    orderBy: { recordedAt: "desc" },
    include: {
      order: {
        select: {
          id: true,
          orderNumber: true,
          totalPrice: true,
          confirmedPaid: true,
          paymentState: true,
          status: true,
          client: { select: { id: true, name: true, phone: true } },
          dispatch: {
            select: {
              id: true,
              expectedCollection: true,
              returnedAt: true,
              driver: { select: { id: true, name: true } },
            },
          },
        },
      },
      collectedByDriver: { select: { id: true, name: true, phone: true } },
      recordedBy: { select: { id: true, name: true, email: true } },
      handedOverTo: { select: { id: true, name: true } },
      confirmedBy: { select: { id: true, name: true } },
      rejectedBy: { select: { id: true, name: true } },
    },
  });
  return ok(payments);
});

/**
 * POST /api/payments
 * Record a Payment row. Used both at order placement (no driver) and at
 * the delivery cash-collection step (driver set). Always lands as
 * PENDING_CONFIRMATION; an OWNER must confirm before it counts toward
 * Order.confirmedPaid.
 */
export const POST = handler(async (req: NextRequest) => {
  const body = PaymentRecordSchema.parse(await req.json());

  const user = await getCurrentUser();
  if (!user) return fail("Unauthorized", 401);
  // Verify the actor exists in the DB (defends against stale JWTs after a reset)
  const recorder = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { id: true },
  });
  if (!recorder) {
    return fail("Your session is stale — please log out and log back in.", 401);
  }

  const order = await prisma.order.findUnique({ where: { id: body.orderId } });
  if (!order) return fail("Order not found", 404);
  if (order.status === "CANCELED") return fail("Cannot record payment on a canceled order", 422);

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        orderId: body.orderId,
        amount: body.amount,
        method: body.method,
        status: "PENDING_CONFIRMATION",
        recordedById: recorder.id,
        recordedAt: new Date(),
        collectedById: body.collectedById ?? null,
        collectedAt: body.collectedAt ?? null,
        notes: body.notes ?? null,
      },
    });
    await tx.orderEvent.create({
      data: {
        orderId: body.orderId,
        type: "PAYMENT_RECORDED",
        actorId: recorder.id,
        message: `Payment recorded: ${body.amount} (${body.method}) — pending confirmation`,
        payload: {
          paymentId: p.id,
          amount: Number(body.amount),
          method: body.method,
          collectedById: body.collectedById ?? null,
        },
      },
    });
    return p;
  });

  return created(payment);
});
