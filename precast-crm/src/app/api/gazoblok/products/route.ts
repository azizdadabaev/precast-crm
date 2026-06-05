export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, created } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { GazoblokProductInputSchema } from "@/lib/gazoblok-validation";

/** GET /api/gazoblok/products — gazoblok.view. Catalog with current stock. */
export const GET = withAuth(async () => {
  const products = await prisma.gazoblokProduct.findMany({
    orderBy: [{ active: "desc" }, { seq: "asc" }, { createdAt: "asc" }],
    include: { stock: true },
  });
  return ok(products);
});

/** POST /api/gazoblok/products — gazoblok.manage. Create a catalog size. */
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const body = GazoblokProductInputSchema.parse(await req.json());
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
