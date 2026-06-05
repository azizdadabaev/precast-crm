export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { GazoblokProductUpdateSchema } from "@/lib/gazoblok-validation";

/** PATCH /api/gazoblok/products/[id] — gazoblok.manage. Edit a catalog size. */
export const PATCH = withAuth<{ id: string }>(
  async (req: NextRequest, { user, params }) => {
    const body = GazoblokProductUpdateSchema.parse(await req.json());
    const product = await prisma.gazoblokProduct.update({ where: { id: params.id }, data: body });
    recordAudit({
      userId: user.id,
      action: "gazoblok.product.update",
      targetType: "gazoblok_product",
      targetId: product.id,
      message: `Updated газоблок size ${product.label}`,
    });
    return ok(product);
  },
);

/** DELETE /api/gazoblok/products/[id] — gazoblok.manage. Soft-disable (keeps
 *  the product linked to any historical order lines + stock ledger). */
export const DELETE = withAuth<{ id: string }>(
  async (_req: NextRequest, { user, params }) => {
    const product = await prisma.gazoblokProduct.update({
      where: { id: params.id },
      data: { active: false },
    });
    recordAudit({
      userId: user.id,
      action: "gazoblok.product.disable",
      targetType: "gazoblok_product",
      targetId: product.id,
      message: `Disabled газоблок size ${product.label}`,
    });
    return ok(product);
  },
);
