import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ClientCreateSchema } from "@/lib/validation";
import { ok, created, handler } from "@/lib/api";

export const GET = handler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const language = searchParams.get("language") ?? undefined;

  const where = {
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" as const } },
        { phone: { contains: q } },
        { location: { contains: q, mode: "insensitive" as const } },
      ],
    }),
    ...(language && { language: language as "UZ" | "RU" }),
  };

  const clients = await prisma.client.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { deals: true } },
    },
    take: 200,
  });

  return ok(clients);
});

export const POST = handler(async (req: NextRequest) => {
  const body = ClientCreateSchema.parse(await req.json());
  const client = await prisma.client.create({ data: body });
  return created(client);
});
