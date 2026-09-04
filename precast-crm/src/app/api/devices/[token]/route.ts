export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";

/** DELETE /api/devices/[token] — sign-out on the phone. Scoped to the
 *  caller's own rows so one user cannot unregister another's device. */
export const DELETE = withAuth<{ token: string }>(async (_req: NextRequest, { user, params }) => {
  const res = await prisma.device.deleteMany({
    where: { fcmToken: params.token, userId: user.id },
  });
  return ok({ deleted: res.count > 0 });
});
