export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, created } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { saveImageFromFormData, UploadError } from "@/lib/uploads";
import { canAddLoadedPhoto } from "@/lib/loaded-photos";
import { recordAudit } from "@/lib/audit";

/** POST /api/orders/[id]/loaded-photos — order.edit. Append one more loaded-truck
 *  photo to an already-loaded order. Multipart: file. Does NOT change status. */
export const POST = withPermission<{ id: string }>("order.edit", async (req: NextRequest, { user, params }) => {
  const order = await prisma.order.findUnique({ where: { id: params.id }, select: { id: true, status: true, orderNumber: true } });
  if (!order) return fail("Order not found", 404);
  if (!canAddLoadedPhoto(order.status)) {
    return fail(`Order must be loaded first (current: ${order.status})`, 422);
  }
  let formData: FormData;
  try { formData = await req.formData(); } catch { return fail("Expected multipart/form-data", 400); }
  let url: string;
  try {
    const saved = await saveImageFromFormData(formData.get("file"), `orders/${params.id}`, `loaded-${Date.now()}`);
    url = saved.url;
  } catch (e) {
    if (e instanceof UploadError) return fail(e.message, e.status);
    throw e;
  }
  const photo = await prisma.galleryPhoto.create({
    data: { orderId: params.id, kind: "LOADED", url, uploadedById: user.id },
    select: { id: true, url: true, uploadedAt: true },
  });
  recordAudit({ userId: user.id, action: "order.loadedPhotoAdded", targetType: "order", targetId: params.id, message: `Loaded photo added to ${order.orderNumber}` });
  return created(photo);
});
