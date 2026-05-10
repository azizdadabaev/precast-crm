export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { LoginSchema } from "@/lib/validation";
import { ok, fail, handler } from "@/lib/api";
import { signToken, verifyPassword, setAuthCookie } from "@/lib/auth";
import { homeForUser } from "@/lib/permissions";

export const POST = handler(async (req: NextRequest) => {
  const body = LoginSchema.parse(await req.json());
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user) return fail("Invalid credentials", 401);

  if (!user.isActive) {
    // Generic message — avoids confirming "this account exists" before
    // revealing the disabled state. The /login UI can pattern-match.
    return fail("Аккаунт ўчирилган · Account is disabled", 403);
  }

  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) return fail("Invalid credentials", 401);

  const token = await signToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  await setAuthCookie(token);

  // Stamp lastLogin so the /users list can show "active in last 7d" etc.
  // Best-effort: don't block login if this update fails.
  prisma.user
    .update({ where: { id: user.id }, data: { lastLogin: new Date() } })
    .catch(() => undefined);

  // Decide where to redirect. If the user must change their password
  // first, route them to /change-password (Phase 5 ships the page;
  // until then the route is "any-auth", so any authenticated user can
  // hit it). Otherwise, send them to homeForUser — the first page
  // they actually have permission for.
  const redirectTo = user.mustChangePassword
    ? "/change-password?force=1"
    : homeForUser({
        permissions: user.permissions,
        isActive: user.isActive,
      });

  return ok({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      mustChangePassword: user.mustChangePassword,
    },
    redirectTo,
  });
});
