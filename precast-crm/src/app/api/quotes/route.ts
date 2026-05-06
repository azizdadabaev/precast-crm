export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { QuoteCreateSchema } from "@/lib/validation";
import { ok, created, handler } from "@/lib/api";

export const GET = handler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? undefined;
  const quotes = await prisma.quote.findMany({
    where: { ...(projectId && { projectId }) },
    orderBy: { createdAt: "desc" },
    include: {
      project: { include: { deal: { include: { client: true } } } },
    },
  });
  return ok(quotes);
});

export const POST = handler(async (req: NextRequest) => {
  const body = QuoteCreateSchema.parse(await req.json());

  // Sum the room subtotals stored on this project's calculations
  const calcs = await prisma.calculation.findMany({
    where: { projectId: body.projectId },
    select: { subtotal: true },
  });
  const roomsSubtotal = calcs.reduce((s, c) => s + Number(c.subtotal), 0);
  const discountAmount = roomsSubtotal * (body.discountPercent / 100);
  const total = roomsSubtotal - discountAmount + body.deliveryCost + body.otherCost;

  const quote = await prisma.quote.create({
    data: {
      projectId: body.projectId,
      calculationId: body.calculationId ?? null,
      roomsSubtotal,
      discountPercent: body.discountPercent,
      discountAmount,
      deliveryCost: body.deliveryCost,
      otherCost: body.otherCost,
      totalPrice: total,
      status: body.status,
      notes: body.notes,
    },
  });

  // Push the deal forward to QUOTE_SENT (if quote sent immediately)
  if (body.status === "SENT") {
    const project = await prisma.project.findUnique({ where: { id: body.projectId } });
    if (project) {
      await prisma.deal
        .update({
          where: { id: project.dealId },
          data: { stage: "QUOTE_SENT", value: total },
        })
        .catch(() => null);
    }
  }

  return created(quote);
});
