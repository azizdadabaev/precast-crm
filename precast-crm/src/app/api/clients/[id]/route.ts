export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { ClientUpdateSchema } from "@/lib/validation";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { deleteClientCascade } from "@/lib/record-delete";

type Ctx = { params: { id: string } };

export const GET = withPermission<Ctx["params"]>(
  "client.view",
  async (_req: NextRequest, { params }) => {
    const client = await prisma.client.findUnique({
      where: { id: params.id },
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
  },
);

export const PATCH = withPermission<Ctx["params"]>(
  "client.edit",
  async (req: NextRequest, { params }) => {
    const body = ClientUpdateSchema.parse(await req.json());

    // The phone is stored digits-only (every lookup path normalizes before
    // querying), so an unnormalized write here would make the row
    // unfindable. Same guard as PATCH /api/drivers/[id].
    const { phone, ...rest } = body;
    const data: Prisma.ClientUpdateInput = { ...rest };
    if (phone != null) {
      const phoneNorm = normalizePhone(phone);
      if (!phoneNorm) {
        return fail(
          "Телефон рақами нотўғри — рақамларни киритинг · Invalid phone number — digits required",
          422,
        );
      }
      data.phone = phoneNorm;
    }

    const client = await prisma.client.update({
      where: { id: params.id },
      data,
    });
    return ok(client);
  },
);

export const DELETE = withPermission<Ctx["params"]>(
  "client.delete",
  async (_req: NextRequest, { params, user }) => {
    const client = await prisma.client.findUnique({
      where: { id: params.id },
      select: { id: true, name: true },
    });
    if (!client) return fail("Client not found", 404);

    // Owner-only hard delete used to clear test data: removes the client
    // along with its orders, projects (+ calculations), deals, and any
    // gazoblok orders.
    await prisma.$transaction((tx) => deleteClientCascade(tx, client.id));

    recordAudit({
      userId: user.id,
      action: "client.delete",
      targetType: "client",
      targetId: client.id,
      message: `Deleted client ${client.name} (+ orders, projects, deals)`,
      metadata: { clientId: client.id },
    });
    return ok({ deleted: true });
  },
);
