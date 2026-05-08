export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ClientUpdateSchema } from "@/lib/validation";
import { ok, fail, handler } from "@/lib/api";

export const GET = handler(async (_req: NextRequest, ctx: { params: { id: string } }) => {
  const client = await prisma.client.findUnique({
    where: { id: ctx.params.id },
    include: {
      deals: {
        orderBy: { createdAt: "desc" },
        include: { projects: true },
      },
      orders: { orderBy: { placedAt: "desc" }, take: 20 },
    },
  });
  if (!client) return fail("Client not found", 404);
  return ok(client);
});

export const PATCH = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const body = ClientUpdateSchema.parse(await req.json());

  // Stamp consentUpdatedAt whenever the consent state itself moves. We
  // also stamp it when only the note changes, since a note revision is a
  // meaningful audit event even when the value didn't flip.
  const touchedConsent =
    body.referenceConsent !== undefined || body.consentNote !== undefined;

  const client = await prisma.client.update({
    where: { id: ctx.params.id },
    data: {
      ...body,
      ...(touchedConsent ? { consentUpdatedAt: new Date() } : {}),
    },
  });
  return ok(client);
});

export const DELETE = handler(async (_req: NextRequest, ctx: { params: { id: string } }) => {
  await prisma.client.delete({ where: { id: ctx.params.id } });
  return ok({ deleted: true });
});
