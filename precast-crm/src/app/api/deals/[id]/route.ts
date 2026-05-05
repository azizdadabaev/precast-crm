export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { DealUpdateSchema } from "@/lib/validation";
import { ok, fail, handler } from "@/lib/api";

export const GET = handler(async (_req: NextRequest, ctx: { params: { id: string } }) => {
  const deal = await prisma.deal.findUnique({
    where: { id: ctx.params.id },
    include: {
      client: true,
      assignedTo: { select: { id: true, name: true, email: true } },
      projects: {
        include: {
          calculations: { orderBy: { createdAt: "desc" }, take: 1 },
          quotes: { orderBy: { createdAt: "desc" }, take: 5 },
        },
      },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!deal) return fail("Deal not found", 404);
  return ok(deal);
});

export const PATCH = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const body = DealUpdateSchema.parse(await req.json());
  const deal = await prisma.deal.update({
    where: { id: ctx.params.id },
    data: body,
    include: { client: true },
  });
  return ok(deal);
});

export const DELETE = handler(async (_req: NextRequest, ctx: { params: { id: string } }) => {
  await prisma.deal.delete({ where: { id: ctx.params.id } });
  return ok({ deleted: true });
});
