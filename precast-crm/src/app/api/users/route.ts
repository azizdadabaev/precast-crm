export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { CreateUserSchema } from "@/lib/validation";
import { ok, fail, created } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { hashPin, deriveLoginName } from "@/lib/auth";
import { ACTIONS, type Action } from "@/lib/permissions";

/**
 * GET /api/users — user.view
 *
 * Returns every user (active + disabled) for the management table.
 * Sorted by isActive desc → role asc → name asc so the active staff
 * float to the top, grouped by role.
 */
export const GET = withPermission("user.view", async () => {
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      loginName: true,
      email: true,
      name: true,
      role: true,
      permissions: true,
      isActive: true,
      mustChangePassword: true,
      lastLogin: true,
      createdAt: true,
      createdById: true,
      telegramUserId: true,
    },
  });
  return ok(users);
});

/**
 * POST /api/users — user.create
 *
 * Creates a new user with a display name + 4-digit PIN.
 * loginName is auto-derived from the display name (deduped with " 2", " 3" suffix).
 */
export const POST = withPermission("user.create", async (req: NextRequest, { user: actor }) => {
  const data = CreateUserSchema.parse(await req.json());

  const validSet = new Set<string>(ACTIONS);
  const invalid = data.permissions.filter((p) => !validSet.has(p));
  if (invalid.length) {
    return fail(
      `Нотўғри рухсатлар: ${invalid.join(", ")} · Unknown permissions: ${invalid.join(", ")}`,
      422,
    );
  }

  const escalating =
    data.permissions.includes("user.disable") ||
    data.permissions.includes("user.editPermissions");
  if (escalating && actor.role !== "OWNER") {
    return fail(
      "user.disable / user.editPermissions can only be granted by OWNER",
      403,
    );
  }

  // Derive a unique loginName from the display name
  const existingLoginNames = await prisma.user.findMany({ select: { loginName: true } });
  const taken = new Set<string>(
    existingLoginNames.map((u) => u.loginName?.toLowerCase()).filter((v): v is string => !!v),
  );
  const loginName = deriveLoginName(data.name, taken);

  const pinHash = await hashPin(data.pin);

  const newUser = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        name: data.name,
        loginName,
        pinHash,
        role: data.role,
        permissions: data.permissions as Action[],
        mustChangePassword: true,
        isActive: true,
        createdById: actor.id,
      },
      select: {
        id: true,
        loginName: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        isActive: true,
        mustChangePassword: true,
        createdAt: true,
      },
    });

    await tx.userAuditLog.create({
      data: {
        userId: u.id,
        actorId: actor.id,
        action: "created",
        newValue: JSON.stringify({
          role: data.role,
          permissions: data.permissions,
        }),
      },
    });

    return u;
  });

  return created(newUser);
});
