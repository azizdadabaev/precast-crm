// DESTRUCTIVE: wipes all operational data from the database, preserving
// only auth tables and system config. Use this once on the production
// droplet immediately after the multi-user Blender PDF deploy to remove
// the test data accumulated during dev.
//
// Preserved:
//   - users            (login + permissions)
//   - user_audit_log   (auth trail)
//   - app_config       (system settings, not "test data")
//
// Truncated (CASCADE):
//   - clients, deals
//   - projects, calculations
//   - orders, order_events
//   - drivers, dispatches
//   - payments, discrepancies, export_events
//   - inventory_items, production_entries, production_lines, stock_movements
//   - drawing_requests
//
// Usage:
//   npx tsx scripts/wipe-operational-data.ts           # dry-run (prints counts only)
//   npx tsx scripts/wipe-operational-data.ts --confirm  # actually wipes

import { prisma } from "../src/lib/prisma";

const TABLES_TO_WIPE = [
  "drawing_requests",
  "stock_movements",
  "production_entries",
  "production_lines",
  "inventory_items",
  "export_events",
  "discrepancies",
  "payments",
  "dispatches",
  "drivers",
  "order_events",
  "orders",
  "calculations",
  "projects",
  "deals",
  "clients",
];

const PRESERVED_TABLES = ["users", "user_audit_log", "app_config"];

async function main() {
  const confirm = process.argv.includes("--confirm");

  console.log("Tables to truncate:");
  for (const t of TABLES_TO_WIPE) {
    const [{ count }] = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "${t}"`,
    );
    console.log(`  ${t.padEnd(22)} ${count.toString().padStart(8)} rows`);
  }
  console.log("\nTables preserved (untouched):");
  for (const t of PRESERVED_TABLES) {
    const [{ count }] = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "${t}"`,
    );
    console.log(`  ${t.padEnd(22)} ${count.toString().padStart(8)} rows`);
  }

  if (!confirm) {
    console.log(
      "\nDry run. Re-run with --confirm to actually truncate.",
    );
    return;
  }

  console.log("\n--confirm flag passed. Truncating in 5 seconds…");
  await new Promise((r) => setTimeout(r, 5000));

  const quoted = TABLES_TO_WIPE.map((t) => `"${t}"`).join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
  );

  console.log("Done. Verifying row counts:");
  for (const t of TABLES_TO_WIPE) {
    const [{ count }] = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count FROM "${t}"`,
    );
    console.log(`  ${t.padEnd(22)} ${count.toString().padStart(8)} rows`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
