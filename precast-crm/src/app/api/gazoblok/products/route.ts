export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, created, fail } from "@/lib/api";
import { withAuth, withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { GazoblokProductInputSchema } from "@/lib/gazoblok-validation";

/** GET /api/gazoblok/products — auth-only (open to all logged-in users —
 *  owner decision). Catalog with current stock. */
export const GET = withAuth(async () => {
  const products = await prisma.gazoblokProduct.findMany({
    orderBy: [{ active: "desc" }, { seq: "asc" }, { createdAt: "asc" }],
    include: { stock: true },
  });
  return ok(products);
});

/** POST /api/gazoblok/products — pricing.edit (catalog mutation, owner
 *  decision 2026-07-23). Create a catalog size. */
export const POST = withPermission("pricing.edit", async (req: NextRequest, { user }) => {
  const body = GazoblokProductInputSchema.parse(await req.json());
  // A second ACTIVE product with the same dimensions would be indistinguishable
  // in the catalog/quotes — reject instead of silently duplicating.
  const duplicate = await prisma.gazoblokProduct.findFirst({
    where: {
      active: true,
      lengthM: body.lengthM,
      heightM: body.heightM,
      thicknessM: body.thicknessM,
    },
    select: { id: true },
  });
  if (duplicate) {
    return fail("Бу ўлчам аллақачон мавжуд · This size already exists", 422);
  }
  const product = await prisma.gazoblokProduct.create({ data: { ...body } });
  recordAudit({
    userId: user.id,
    action: "gazoblok.product.create",
    targetType: "gazoblok_product",
    targetId: product.id,
    message: `Created газоблок size ${product.label}`,
  });
  return created(product);
});
