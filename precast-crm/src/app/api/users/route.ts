export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { CreateUserSchema } from "@/lib/validation";
import { ok, fail, created } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { hashPassword } from "@/lib/auth";
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
      email: true,
      name: true,
      role: true,
      permissions: true,
      isActive: true,
      mustChangePassword: true,
      lastLogin: true,
      createdAt: true,
      createdById: true,
    },
  });
  return ok(users);
});

/**
 * POST /api/users — user.create
 *
 * Creates a new user from the dialog's template + permissions checklist.
 * The actor's authority gate:
 *   - Granting user.disable or user.editPermissions requires the
 *     ACTOR's role to be OWNER (these are OWNER-only powers and we
 *     don't let an ADMIN escalate by handing them to someone else).
 *
 * Side effect: appends a UserAuditLog entry (action="created") with
 * the role + permissions snapshot in newValue.
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

  const emailLower = data.email.toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email: emailLower } });
  if (exists) return fail("Email already in use", 409);

  const passwordHash = await hashPassword(data.password);

  const newUser = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        name: data.name,
        email: emailLower,
        passwordHash,
        role: data.role,
        permissions: data.permissions as Action[],
        // Force-change on first login — operator gives the temporary
        // password to the user, who then sets their own.
        mustChangePassword: true,
        isActive: true,
        createdById: actor.id,
      },
      select: {
        id: true,
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
