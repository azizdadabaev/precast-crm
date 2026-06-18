export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { deleteUpload } from "@/lib/uploads";
import { recordAudit } from "@/lib/audit";

/** DELETE /api/orders/[id]/loaded-photos/[photoId] — order.edit. Remove a loaded
 *  photo (row + file). Repoints Order.loadedPhotoUrl if it pointed at this one.
 *  Does NOT change order status. */
export const DELETE = withPermission<{ id: string; photoId: string }>("order.edit", async (_req: NextRequest, { user, params }) => {
  const photo = await prisma.galleryPhoto.findUnique({
    where: { id: params.photoId },
    select: { id: true, orderId: true, kind: true, url: true },
  });
  if (!photo || photo.orderId !== params.id || photo.kind !== "LOADED") {
    return fail("Photo not found", 404);
  }
  const order = await prisma.order.findUnique({ where: { id: params.id }, select: { loadedPhotoUrl: true, orderNumber: true } });

  await prisma.$transaction(async (tx) => {
    await tx.galleryPhoto.delete({ where: { id: photo.id } });
    if (order?.loadedPhotoUrl === photo.url) {
      const next = await tx.galleryPhoto.findFirst({
        where: { orderId: params.id, kind: "LOADED" },
        orderBy: { uploadedAt: "desc" },
        select: { url: true },
      });
      await tx.order.update({ where: { id: params.id }, data: { loadedPhotoUrl: next?.url ?? null } });
    }
  });

  await deleteUpload(photo.url).catch(() => {});
  recordAudit({ userId: user.id, action: "order.loadedPhotoDeleted", targetType: "order", targetId: params.id, message: `Loaded photo deleted from ${order?.orderNumber ?? params.id}` });
  return ok({ id: photo.id });
});
