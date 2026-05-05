import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { DealCreateSchema } from "@/lib/validation";
import { ok, created, handler } from "@/lib/api";

export const GET = handler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const stage = searchParams.get("stage") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  const deals = await prisma.deal.findMany({
    where: {
      ...(stage && { stage: stage as never }),
      ...(status && { status: status as never }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { id: true, name: true, phone: true, language: true } },
      assignedTo: { select: { id: true, name: true } },
      projects: { select: { id: true } },
    },
    take: 500,
  });

  return ok(deals);
});

export const POST = handler(async (req: NextRequest) => {
  const body = DealCreateSchema.parse(await req.json());
  const deal = await prisma.deal.create({
    data: body,
    include: { client: true },
  });
  return created(deal);
});
