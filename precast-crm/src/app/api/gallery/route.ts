export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { GalleryListSchema } from "@/lib/validation";
import { phoneMatchForms } from "@/lib/phone";
import { addressSearchForms } from "@/lib/regions";
import { assembleGalleryPosts, postKey, type GalleryPhotoView } from "@/lib/gallery-posts";

/**
 * GET /api/gallery
 *
 * Paginated feed across all orders, grouped into POSTS — one per
 * (orderId, kind) — so an order's multiple same-kind uploads (e.g. several
 * split-shipment photos) collapse into a single swipeable card. Pagination is
 * by post; `photoTotal` is the underlying photo count for the header label.
 * Supports filtering by kind, client, and uploaded-at date range.
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

  // Group into posts keyed by (orderId, kind). The page of groups is ordered by
  // each group's most-recent upload; `groups` gives that page + order, `allGroups`
  // gives the total post count, and the existing photo count is the header label.
  const [photoTotal, allGroups, groups] = await prisma.$transaction([
    prisma.galleryPhoto.count({ where }),
    prisma.galleryPhoto.groupBy({ by: ["orderId", "kind"], where, orderBy: { orderId: "asc" } }),
    prisma.galleryPhoto.groupBy({
      by: ["orderId", "kind"],
      where,
      _max: { uploadedAt: true },
      orderBy: { _max: { uploadedAt: "desc" } },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
  ]);

  const postTotal = allGroups.length;
  const orderedKeys = groups.map((g) => postKey(g.orderId, g.kind));

  // Fetch every photo belonging to this page's groups (still honoring the base
  // filter so a group's out-of-range photos aren't pulled in).
  const photoRows = groups.length
    ? await prisma.galleryPhoto.findMany({
        where: { AND: [where, { OR: groups.map((g) => ({ orderId: g.orderId, kind: g.kind })) }] },
        orderBy: { uploadedAt: "asc" },
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
      })
    : [];

  const views: GalleryPhotoView[] = photoRows.map((p) => ({
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
  }));

  const posts = assembleGalleryPosts(views, orderedKeys);

  return ok({
    posts,
    total: postTotal,
    photoTotal,
    page: params.page,
    pageSize: params.pageSize,
    pageCount: Math.ceil(postTotal / params.pageSize),
  });
});
