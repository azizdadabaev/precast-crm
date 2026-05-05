import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { RegisterSchema } from "@/lib/validation";
import { created, handler } from "@/lib/api";
import { hashPassword } from "@/lib/auth";

export const POST = handler(async (req: NextRequest) => {
  const body = RegisterSchema.parse(await req.json());
  const passwordHash = await hashPassword(body.password);
  const user = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      passwordHash,
      role: body.role,
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
  return created(user);
});
