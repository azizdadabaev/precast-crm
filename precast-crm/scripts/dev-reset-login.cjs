// LOCAL DEV ONLY — resets/creates an OWNER login with a known PIN and
// grants inbox.access so the Telegram inbox can be tested locally.
// Run from the inner precast-crm folder: node scripts/dev-reset-login.cjs
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const OWNER_PERMS = [
  "user.view","user.create","user.edit","user.editPermissions","user.disable",
  "calculator.use","order.view","order.viewAll","order.create","order.edit","order.cancel",
  "order.exportBackup","project.delete","audit.view","pricing.edit","comment.moderate",
  "client.view","client.viewAll","client.create","client.edit","client.export",
  "payment.view","payment.record","payment.confirm",
  "dispatch.view","dispatch.create","driver.view","driver.manage",
  "discrepancy.view","discrepancy.resolve","inventory.view","inventory.manage",
  "dashboard.view","dashboard.viewBasic","sandbox.access","blender.bridge",
  "report.view","report.export","inbox.access",
];

(async () => {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, loginName: true, role: true, isActive: true, pinHash: true, permissions: true },
    });

    console.log(`Local DB has ${users.length} user(s):`);
    for (const u of users) {
      console.log(`  - loginName=${u.loginName ?? "(null)"} | role=${u.role} | active=${u.isActive} | hasPin=${!!u.pinHash} | inbox.access=${u.permissions.includes("inbox.access")}`);
    }

    const pinHash = await bcrypt.hash("1234", 10);

    if (users.length === 0) {
      const created = await prisma.user.create({
        data: {
          name: "Aziz", loginName: "Aziz", role: "OWNER",
          permissions: OWNER_PERMS, pinHash, isActive: true, mustChangePassword: false,
        },
        select: { loginName: true, role: true },
      });
      console.log(`\nCREATED owner → loginName="${created.loginName}" PIN=1234 (inbox.access granted)`);
      return;
    }

    const target = users.find((u) => u.role === "OWNER")
      ?? [...users].sort((a, b) => b.permissions.length - a.permissions.length)[0];
    const loginName = target.loginName ?? target.name;
    const perms = Array.from(new Set([...target.permissions, "inbox.access"]));
    await prisma.user.update({
      where: { id: target.id },
      data: { pinHash, isActive: true, permissions: perms, loginName, mustChangePassword: false },
    });
    console.log(`\nRESET owner → loginName="${loginName}" role=${target.role} PIN=1234 (inbox.access granted, active)`);
  } finally {
    await prisma.$disconnect();
  }
})();
