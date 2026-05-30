export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ChangePinSchema } from "@/lib/validation";
import { ok, fail } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import { hashPin, verifyPin } from "@/lib/auth";

/**
 * POST /api/users/me/password — withAuth
 *
 * Self-service PIN change. Two flows:
 *   1. Voluntary: user enters currentPin + newPin.
 *   2. Forced (mustChangePassword=true): currentPin is ignored.
 *
 * Side effect: clears mustChangePassword, writes a UserAuditLog
 * "pin_reset" entry with actorId = userId (self-action).
 */
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const data = ChangePinSchema.parse(await req.json());

  const dbUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { id: true, pinHash: true, mustChangePassword: true },
  });

  if (!dbUser.mustChangePassword) {
    if (!data.currentPin) {
      return fail("Жорий PIN керак · Current PIN required", 400);
    }
    if (!dbUser.pinHash) {
      return fail("PIN ўрнатилмаган · No PIN set", 400);
    }
    const valid = await verifyPin(data.currentPin, dbUser.pinHash);
    if (!valid) return fail("Жорий PIN нотўғри · Current PIN is wrong", 401);
  }

  const newHash = await hashPin(data.newPin);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { pinHash: newHash, mustChangePassword: false },
    });
    await tx.userAuditLog.create({
      data: { userId: user.id, actorId: user.id, action: "pin_reset" },
    });
  });

  return ok({ changed: true });
});
