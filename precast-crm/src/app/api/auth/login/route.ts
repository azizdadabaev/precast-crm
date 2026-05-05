export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { LoginSchema } from "@/lib/validation";
import { ok, fail, handler } from "@/lib/api";
import { signToken, verifyPassword, setAuthCookie } from "@/lib/auth";

export const POST = handler(async (req: NextRequest) => {
  const body = LoginSchema.parse(await req.json());
  const user = await prisma.user.findUnique({ where: { email: body.email } });
  if (!user) return fail("Invalid credentials", 401);

  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) return fail("Invalid credentials", 401);

  const token = await signToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  });
  await setAuthCookie(token);

  return ok({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});
