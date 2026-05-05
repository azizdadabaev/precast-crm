export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail, handler } from "@/lib/api";

export const GET = handler(async (_req: NextRequest, ctx: { params: { id: string } }) => {
  const quote = await prisma.quote.findUnique({
    where: { id: ctx.params.id },
    include: {
      project: { include: { deal: { include: { client: true } } } },
      calculation: true,
    },
  });
  if (!quote) return fail("Quote not found", 404);
  return ok(quote);
});
