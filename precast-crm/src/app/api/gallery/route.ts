export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { GalleryListSchema } from "@/lib/validation";

/**
 * GET /api/gallery
 *
 * Paginated photo feed across all orders. Supports filtering by kind,
 * client, and uploaded-at date range. Each row is a flattened
 * GalleryPhoto with the order + client context the grid needs.
 */
export const GET = withPermission("order.view", async (req: NextRequest) => {
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const params = GalleryListSchema.parse(sp);

  const where = {
    ...(params.kind ? { kind: params.kind } : {}),
    ...(params.clientId ? { order: { clientId: params.clientId } } : {}),
    ...(params.from || params.to
      ? {
          uploadedAt: {
            ...(params.from ? { gte: params.from } : {}),
            ...(params.to ? { lte: params.to } : {}),
          },
        }
      : {}),
  };

  const [total, photos] = await prisma.$transaction([
    prisma.galleryPhoto.count({ where }),
    prisma.galleryPhoto.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            client: { select: { id: true, name: true } },
          },
        },
        uploadedBy: { select: { id: true, name: true } },
      },
    }),
  ]);

  return ok({
    photos: photos.map((p) => ({
      id: p.id,
      orderId: p.orderId,
      orderNumber: p.order.orderNumber,
      clientId: p.order.client.id,
      clientName: p.order.client.name,
      kind: p.kind,
      url: p.url,
      uploadedAt: p.uploadedAt.toISOString(),
      uploadedBy: p.uploadedBy,
      orderStatus: p.order.status,
    })),
    total,
    page: params.page,
    pageSize: params.pageSize,
    pageCount: Math.ceil(total / params.pageSize),
  });
});
