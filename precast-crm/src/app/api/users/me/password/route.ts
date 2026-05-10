export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ChangePasswordSchema } from "@/lib/validation";
import { ok, fail } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import { hashPassword, verifyPassword } from "@/lib/auth";

/**
 * POST /api/users/me/password — withAuth
 *
 * Self-service password change. Two flows land here:
 *   1. Voluntary: user enters current + new password.
 *   2. Forced (mustChangePassword=true): user just enters new password;
 *      currentPassword is ignored. We still require them to be
 *      authenticated (cookie + isActive) — withAuth handles that.
 *
 * Side effect: clears mustChangePassword, writes a UserAuditLog
 * "password_reset" entry with actorId = userId (self-action).
 */
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const data = ChangePasswordSchema.parse(await req.json());

  const dbUser = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { id: true, passwordHash: true, mustChangePassword: true },
  });

  // Voluntary change — must verify current password.
  if (!dbUser.mustChangePassword) {
    if (!data.currentPassword) {
      return fail(
        "Жорий парол керак · Current password required",
        400,
      );
    }
    const ok = await verifyPassword(data.currentPassword, dbUser.passwordHash);
    if (!ok) return fail("Current password is wrong", 401);
  }
  // Forced change — currentPassword ignored. The user already
  // authenticated with whatever temporary password was set.

  const newHash = await hashPassword(data.newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        mustChangePassword: false,
      },
    });
    await tx.userAuditLog.create({
      data: {
        userId: user.id,
        actorId: user.id,
        action: "password_reset",
      },
    });
  });

  return ok({ changed: true });
});
