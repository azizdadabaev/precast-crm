export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { GalleryListSchema } from "@/lib/validation";
import { phoneMatchForms } from "@/lib/phone";
import { addressSearchForms } from "@/lib/regions";

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

  // Free-text search across order number + client fields. Phone gets
  // normalized to all digit-only forms via phoneMatchForms so the user
  // can type "+998 90 111 22 33", "998901112233" or just the last 4
  // digits and still hit the row.
  const searchAnd: Record<string, unknown>[] = [];
  if (params.q) {
    const phoneForms = phoneMatchForms(params.q);
    const addrForms = addressSearchForms(params.q);
    const orFilters: Record<string, unknown>[] = [
      { order: { orderNumber: { contains: params.q, mode: "insensitive" } } },
      { order: { client: { name: { contains: params.q, mode: "insensitive" } } } },
    ];
    for (const a of addrForms) {
      orFilters.push({
        order: { client: { address: { contains: a, mode: "insensitive" } } },
      });
    }
    for (const f of phoneForms) {
      orFilters.push({ order: { client: { phone: { contains: f } } } });
    }
    searchAnd.push({ OR: orFilters });
  }

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
    ...(searchAnd.length ? { AND: searchAnd } : {}),
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
            client: { select: { id: true, name: true, phone: true, address: true } },
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
      clientPhone: p.order.client.phone,
      clientAddress: p.order.client.address,
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
