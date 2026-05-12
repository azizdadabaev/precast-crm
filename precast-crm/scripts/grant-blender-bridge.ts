// One-off script: grant `blender.bridge` to every existing OWNER user.
//
// Background: role templates pre-fill `User.permissions` at creation
// time. When we added `blender.bridge` to the OWNER template, only
// FUTURE owners get it; the user already in the DB needs an explicit
// grant. This script is idempotent — re-running it is safe.
//
// Run with:
//   npx tsx scripts/grant-blender-bridge.ts

import { prisma } from "../src/lib/prisma";

async function main() {
  const owners = await prisma.user.findMany({
    where: { role: "OWNER" },
    select: { id: true, name: true, email: true, permissions: true },
  });

  if (owners.length === 0) {
    console.log("No OWNER users found.");
    return;
  }

  let updated = 0;
  for (const u of owners) {
    if (u.permissions.includes("blender.bridge")) {
      console.log(`✓ ${u.email} already has blender.bridge`);
      continue;
    }
    await prisma.user.update({
      where: { id: u.id },
      data: { permissions: { set: [...u.permissions, "blender.bridge"] } },
    });
    console.log(`+ ${u.email} granted blender.bridge`);
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
