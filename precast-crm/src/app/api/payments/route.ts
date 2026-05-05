export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { PaymentCreateSchema } from "@/lib/validation";
import { ok, created, handler } from "@/lib/api";

export const GET = handler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get("dealId") ?? undefined;
  const payments = await prisma.payment.findMany({
    where: { ...(dealId && { dealId }) },
    orderBy: { createdAt: "desc" },
    include: { deal: { include: { client: { select: { name: true } } } } },
  });
  return ok(payments);
});

export const POST = handler(async (req: NextRequest) => {
  const body = PaymentCreateSchema.parse(await req.json());
  const payment = await prisma.payment.create({
    data: {
      dealId: body.dealId,
      amount: body.amount,
      status: body.status,
      method: body.method,
      reference: body.reference,
      paidAt: body.paidAt,
    },
  });
  return created(payment);
});
