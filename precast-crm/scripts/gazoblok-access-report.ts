/**
 * Who loses gazoblok access when it switches to beam-and-block permissions
 * (renovation Stage 1, spec §4.7). Read-only report for the owner before deploy.
 *
 *   npx tsx scripts/gazoblok-access-report.ts
 *
 * On the server: docker compose run --rm --no-deps -v "$PWD/precast-crm/scripts:/app/scripts" \
 *   app npx tsx scripts/gazoblok-access-report.ts
 *
 * Lists every active user who touched gazoblok in the last 90 days (order events,
 * payments, stock movements, production) and which of the new keys they lack.
 */
import { PrismaClient } from "@prisma/client";
import { GAZOBLOK_PERMISSION } from "../src/lib/gazoblok-permissions";

const prisma = new PrismaClient();

async function main() {
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const [events, payments, movements, production] = await Promise.all([
    prisma.gazoblokOrderEvent.groupBy({ by: ["actorId"], where: { createdAt: { gte: since } }, _count: true }),
    prisma.gazoblokPayment.groupBy({ by: ["recordedById"], where: { recordedAt: { gte: since } }, _count: true }),
    prisma.gazoblokStockMovement.groupBy({ by: ["actorId"], where: { createdAt: { gte: since } }, _count: true }),
    prisma.gazoblokProductionEntry.groupBy({ by: ["recordedById"], where: { createdAt: { gte: since } }, _count: true }),
  ]);
  const activity = new Map<string, number>();
  const add = (id: string | null, n: number) => id && activity.set(id, (activity.get(id) ?? 0) + n);
  events.forEach((e) => add(e.actorId, e._count));
  payments.forEach((p) => add(p.recordedById, p._count));
  movements.forEach((m) => add(m.actorId, m._count));
  production.forEach((p) => add(p.recordedById, p._count));

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, permissions: true },
    orderBy: { name: "asc" },
  });
  const keys = Object.entries(GAZOBLOK_PERMISSION);
  console.log("Gazoblok access after the switch (last 90 days of gazoblok activity)\n");
  for (const u of users) {
    const missing = keys.filter(([, k]) => !u.permissions.includes(k)).map(([what, k]) => `${what} (${k})`);
    const used = activity.get(u.id) ?? 0;
    if (!used && missing.length === keys.length) continue;
    console.log(`${u.name} — ${used} gazoblok actions in 90 days`);
    console.log(missing.length ? `  will NOT be able to: ${missing.join(", ")}` : "  keeps full gazoblok access");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
