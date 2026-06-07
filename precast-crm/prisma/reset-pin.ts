// Dev helper: ensure a working login. Upserts the OWNER user with a known
// loginName + PIN (hashes the PIN into pinHash). Usage:
//   npx tsx prisma/reset-pin.ts ["Login Name"] [pin]
// Defaults: "Aziz Dadabaev" / 1234.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getDefaultPermissionsForRole } from "../src/lib/permissions";

const prisma = new PrismaClient();
const loginName = process.argv[2] || "Aziz Dadabaev";
const pin = process.argv[3] || "1234";

async function main() {
  const pinHash = await bcrypt.hash(pin, 10);
  const user = await prisma.user.upsert({
    where: { email: "owner@precast.local" },
    update: { name: loginName, loginName, pinHash, isActive: true, mustChangePassword: false },
    create: {
      name: loginName,
      loginName,
      email: "owner@precast.local",
      pinHash,
      role: "OWNER",
      permissions: getDefaultPermissionsForRole("OWNER"),
      isActive: true,
      mustChangePassword: false,
    },
  });
  console.log(`✅ Login ready → name: "${user.loginName}"   PIN: ${pin}   (role ${user.role})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
