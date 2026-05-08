export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { DriverUpdateSchema } from "@/lib/validation";
import { ok, fail, handler } from "@/lib/api";
import { normalizePhone } from "@/lib/phone";

export const GET = handler(async (_req: NextRequest, ctx: { params: { id: string } }) => {
  const driver = await prisma.driver.findUnique({
    where: { id: ctx.params.id },
    include: {
      dispatches: {
        orderBy: { dispatchedAt: "desc" },
        take: 30,
        include: {
          order: { select: { id: true, orderNumber: true, totalPrice: true, status: true } },
        },
      },
      discrepancies: {
        orderBy: { reportedAt: "desc" },
        take: 30,
        include: {
          order: { select: { id: true, orderNumber: true } },
        },
      },
    },
  });
  if (!driver) return fail("Driver not found", 404);
  return ok(driver);
});

export const PATCH = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const body = DriverUpdateSchema.parse(await req.json());

  const updates: Record<string, unknown> = {};
  if (body.name != null) updates.name = body.name;
  if (body.notes !== undefined) updates.notes = body.notes ?? null;
  if (body.phone != null) {
    const phoneNorm = normalizePhone(body.phone);
    if (!phoneNorm) return fail("phone is invalid", 422);
    updates.phone = phoneNorm;
  }
  if (Object.keys(updates).length === 0) return fail("Nothing to update", 422);

  const driver = await prisma.driver.update({
    where: { id: ctx.params.id },
    data: updates,
  });
  return ok(driver);
});
