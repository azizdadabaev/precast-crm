// One-off script: grant `blender.bridge` to every existing user whose
// role template now includes it (OWNER, ADMIN, SALES, ACCOUNTANT).
//
// Background: role templates pre-fill `User.permissions` at creation
// time. When we widen a template, only FUTURE users in that role get
// the new permission; existing rows need an explicit grant. This
// script is idempotent — re-running it is safe.
//
// Run with:
//   npx tsx scripts/grant-blender-bridge.ts

import { UserRole } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

const ELIGIBLE_ROLES: UserRole[] = [
  UserRole.OWNER,
  UserRole.ADMIN,
  UserRole.SALES,
  UserRole.ACCOUNTANT,
];

async function main() {
  const users = await prisma.user.findMany({
    where: { role: { in: ELIGIBLE_ROLES } },
    select: { id: true, role: true, email: true, permissions: true },
  });

  if (users.length === 0) {
    console.log(`No users with roles ${ELIGIBLE_ROLES.join("/")} found.`);
    return;
  }

  let updated = 0;
  for (const u of users) {
    if (u.permissions.includes("blender.bridge")) {
      console.log(`✓ ${u.role.padEnd(10)} ${u.email} already has blender.bridge`);
      continue;
    }
    await prisma.user.update({
      where: { id: u.id },
      data: { permissions: { set: [...u.permissions, "blender.bridge"] } },
    });
    console.log(`+ ${u.role.padEnd(10)} ${u.email} granted blender.bridge`);
    updated++;
  }
  console.log(`Done. ${updated} user(s) updated.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
