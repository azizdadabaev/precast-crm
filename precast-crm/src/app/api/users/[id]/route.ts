export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { UpdateUserSchema } from "@/lib/validation";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { hashPin, deriveLoginName } from "@/lib/auth";
import { ACTIONS, type Action } from "@/lib/permissions";

/**
 * PATCH /api/users/[id] — user.edit (gates the request).
 *
 * Field-level authority:
 *   - Editing `permissions` additionally requires user.editPermissions
 *     (OWNER-only by template).
 *   - Setting `isActive=false` (disable) additionally requires
 *     user.disable (OWNER-only).
 *   - Granting user.disable / user.editPermissions requires the actor
 *     to BE OWNER, mirroring the create-user gate.
 *
 * Self-disable is blocked.
 *
 * Side effect: writes UserAuditLog entries for each non-trivially
 * changed field (permissions_changed, role_changed, disabled,
 * enabled, password_reset).
 */
export const PATCH = withPermission<{ id: string }>(
  "user.edit",
  async (req: NextRequest, { user: actor, params }) => {
    const data = UpdateUserSchema.parse(await req.json());

    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) return fail("User not found", 404);

    // Self-protection — blocks the "disable yourself + lock out everyone
    // else who has user.disable" footgun.
    if (data.isActive === false && actor.id === target.id) {
      return fail("Ўзингизни ўчира олмайсиз · Cannot disable yourself", 400);
    }

    if (data.permissions !== undefined && !actor.permissions.includes("user.editPermissions")) {
      return fail(
        "Рухсатни ўзгартиришингизга рухсат йўқ · You can't edit permissions",
        403,
      );
    }
    if (data.isActive === false && !actor.permissions.includes("user.disable")) {
      return fail("Ўчиришга рухсат йўқ · You can't disable users", 403);
    }

    if (data.permissions !== undefined) {
      const validSet = new Set<string>(ACTIONS);
      const invalid = data.permissions.filter((p) => !validSet.has(p));
      if (invalid.length) {
        return fail(`Unknown permissions: ${invalid.join(", ")}`, 422);
      }
      // Only OWNER can grant the OWNER-only flags.
      const escalating =
        data.permissions.includes("user.disable") ||
        data.permissions.includes("user.editPermissions");
      if (escalating && actor.role !== "OWNER") {
        return fail(
          "user.disable / user.editPermissions can only be granted by OWNER",
          403,
        );
      }
    }

    const audits: Array<{
      action: string;
      oldValue?: string;
      newValue?: string;
    }> = [];

    const updates: Record<string, unknown> = {};

    if (data.name !== undefined && data.name !== target.name) {
      updates.name = data.name;
      // Re-derive loginName when the display name changes, unless the suffix
      // already matches (e.g. "Азиз 2" stays "Азиз 2" if still unique).
      const existingLoginNames = await prisma.user.findMany({
        where: { id: { not: target.id } },
        select: { loginName: true },
      });
      const taken = new Set<string>(
        existingLoginNames.map((u) => u.loginName?.toLowerCase()).filter((v): v is string => !!v),
      );
      updates.loginName = deriveLoginName(data.name, taken);
    }

    if (data.role !== undefined && data.role !== target.role) {
      updates.role = data.role;
      audits.push({
        action: "role_changed",
        oldValue: JSON.stringify({ role: target.role }),
        newValue: JSON.stringify({ role: data.role }),
      });
    }

    if (data.permissions !== undefined) {
      const a = [...target.permissions].sort();
      const b = [...data.permissions].sort();
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        updates.permissions = data.permissions as Action[];
        audits.push({
          action: "permissions_changed",
          oldValue: JSON.stringify(target.permissions),
          newValue: JSON.stringify(data.permissions),
        });
      }
    }

    if (data.isActive !== undefined && data.isActive !== target.isActive) {
      updates.isActive = data.isActive;
      audits.push({
        action: data.isActive ? "enabled" : "disabled",
      });
    }

    if (data.resetPin) {
      updates.pinHash = await hashPin(data.resetPin);
      updates.mustChangePassword = true;
      audits.push({ action: "pin_reset" });
    }

    if (!Object.keys(updates).length) {
      // Nothing actually changed — return the current user.
      const u = await prisma.user.findUniqueOrThrow({
        where: { id: target.id },
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
        },
      });
      return ok(u);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: target.id },
        data: updates,
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
        },
      });
      if (audits.length) {
        await tx.userAuditLog.createMany({
          data: audits.map((a) => ({
            userId: target.id,
            actorId: actor.id,
            action: a.action,
            oldValue: a.oldValue ?? null,
            newValue: a.newValue ?? null,
          })),
        });
      }
      return u;
    });

    return ok(updated);
  },
);
