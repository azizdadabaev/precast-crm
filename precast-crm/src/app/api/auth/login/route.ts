export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { LoginSchema } from "@/lib/validation";
import { ok, fail, handler } from "@/lib/api";
import { signToken, verifyPin, setAuthCookie } from "@/lib/auth";
import { homeForUser } from "@/lib/permissions";

export const POST = handler(async (req: NextRequest) => {
  const body = LoginSchema.parse(await req.json());

  // Case-insensitive so "азиз" and "Азиз" both work.
  const user = await prisma.user.findFirst({
    where: { loginName: { equals: body.loginName, mode: "insensitive" } },
  });
  if (!user) return fail("Логин ёки PIN нотўғри · Invalid credentials", 401);

  if (!user.isActive) {
    return fail("Аккаунт ўчирилган · Account is disabled", 403);
  }

  let valid = false;
  if (user.pinHash) {
    valid = await verifyPin(body.pin, user.pinHash);
  } else {
    // Bootstrap: if BOOTSTRAP_PIN is set and no PIN exists yet, allow
    // login so the user can set their own. Remove env var after migration.
    const bootstrapPin = process.env.BOOTSTRAP_PIN;
    valid = !!(bootstrapPin && body.pin === bootstrapPin);
  }

  if (!valid) return fail("Логин ёки PIN нотўғри · Invalid credentials", 401);

  const token = await signToken({
    sub: user.id,
    email: user.email ?? "",
    name: user.name,
    role: user.role,
  });
  await setAuthCookie(token);

  prisma.user
    .update({ where: { id: user.id }, data: { lastLogin: new Date() } })
    .catch(() => undefined);

  const redirectTo = user.mustChangePassword
    ? "/change-password?force=1"
    : homeForUser({ permissions: user.permissions, isActive: user.isActive });

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
