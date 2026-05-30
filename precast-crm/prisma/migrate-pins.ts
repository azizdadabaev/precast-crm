/**
 * prisma/migrate-pins.ts — one-time production migration for PIN login.
 *
 * Run via: npm run db:migrate-pins
 * Deploy: after `prisma db push`, before starting the app.
 *
 * For every user without loginName or pinHash:
 *   - loginName derived from display name ("Азиз", "Азиз 2", …)
 *   - pinHash set to bcrypt(SEED_BOOTSTRAP_PIN, default "1234")
 *   - mustChangePassword set to true (forces PIN change on first login)
 *
 * Safe to re-run: already-migrated users are skipped.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function deriveLoginName(name: string, taken: Set<string>): string {
  const base = name.trim();
  if (!taken.has(base.toLowerCase())) return base;
  let n = 2;
  while (taken.has(`${base} ${n}`.toLowerCase())) n++;
  return `${base} ${n}`;
}

async function main() {
  const BOOTSTRAP_PIN = process.env.SEED_BOOTSTRAP_PIN ?? "1234";

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, loginName: true, pinHash: true },
  });

  const taken = new Set<string>(
    users.map((u) => u.loginName?.toLowerCase()).filter((v): v is string => !!v),
  );

  let updated = 0;
  for (const user of users) {
    const needsLoginName = !user.loginName;
    const needsPin = !user.pinHash;
    if (!needsLoginName && !needsPin) continue;

    const loginName = user.loginName ?? deriveLoginName(user.name, taken);
    if (needsLoginName) taken.add(loginName.toLowerCase());

    const pinHash = user.pinHash ?? (await bcrypt.hash(BOOTSTRAP_PIN, 10));

    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(needsLoginName ? { loginName } : {}),
        ...(needsPin ? { pinHash, mustChangePassword: true } : {}),
      },
    });

    console.log(
      `  ✓ ${user.name} (${user.email ?? "no email"})` +
      `${needsLoginName ? ` → loginName="${loginName}"` : ""}` +
      `${needsPin ? ` PIN=${BOOTSTRAP_PIN} (must change)` : ""}`,
    );
    updated++;
  }

  if (updated === 0) {
    console.log("All users already migrated — nothing to do.");
  } else {
    console.log(`\nMigrated ${updated} user(s). Bootstrap PIN: ${BOOTSTRAP_PIN}`);
    console.log("Users will be prompted to change their PIN on first login.");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
