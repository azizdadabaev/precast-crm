export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { DealUpdateSchema } from "@/lib/validation";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";

type Params = { id: string };

export const GET = withPermission<Params>(
  "order.view",
  async (_req: NextRequest, { params }) => {
    const deal = await prisma.deal.findUnique({
      where: { id: params.id },
      include: {
        client: true,
        assignedTo: { select: { id: true, name: true, email: true } },
        projects: {
          include: {
            calculations: { orderBy: { createdAt: "desc" }, take: 1 },
            orders: { orderBy: { placedAt: "desc" }, take: 5 },
          },
        },
      },
    });
    if (!deal) return fail("Deal not found", 404);
    return ok(deal);
  },
);

export const PATCH = withPermission<Params>(
  "order.edit",
  async (req: NextRequest, { params }) => {
    const body = DealUpdateSchema.parse(await req.json());
    const deal = await prisma.deal.update({
      where: { id: params.id },
      data: body,
      include: { client: true },
    });
    return ok(deal);
  },
);

export const DELETE = withPermission<Params>(
  "order.cancel",
  async (_req: NextRequest, { params }) => {
    await prisma.deal.delete({ where: { id: params.id } });
    return ok({ deleted: true });
  },
);
