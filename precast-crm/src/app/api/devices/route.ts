export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import { DeviceRegisterSchema } from "@/lib/validation";

/**
 * PUT /api/devices — any active user (the Android app, after login and
 * on every FCM token refresh). Upserts by token; a token that belonged
 * to another user (shared phone) is re-pointed to the caller so the
 * previous user stops receiving that phone's notifications.
 */
export const PUT = withAuth(async (req: NextRequest, { user }) => {
  const body = DeviceRegisterSchema.parse(await req.json());
  const device = await prisma.device.upsert({
    where: { fcmToken: body.fcmToken },
    create: {
      userId: user.id,
      fcmToken: body.fcmToken,
      platform: body.platform,
      appVersion: body.appVersion ?? null,
    },
    update: {
      userId: user.id,
      appVersion: body.appVersion ?? null,
      lastSeenAt: new Date(),
    },
    select: { id: true, fcmToken: true },
  });
  return ok(device);
});
