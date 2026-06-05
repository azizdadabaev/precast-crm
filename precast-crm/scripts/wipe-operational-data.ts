// DESTRUCTIVE: wipes all operational data from the database, preserving
// only auth tables and system config. Run once on a target database to
// remove the test data accumulated during dev — e.g. a clean local smoke
// test, or a droplet right after a feature deploy.
//
// Preserved:
//   - users            (login + permissions)
//   - user_audit_log   (auth trail)
//   - app_config       (system settings + pricing/grade config, not "test data")
//
// Truncated (CASCADE) — every operational table across all three areas
// (floor beam-and-block, Telegram inbox, gazoblok aerated blocks):
//   floor:    clients, deals, projects, calculations, orders, order_events,
//             drivers, dispatches, shipments, payments, discrepancies,
//             export_events, inventory_items, production_entries,
//             production_lines, stock_movements, drawing_requests, comments,
//             notifications, gallery_photos, audit_log
//   inbox:    Conversation, Message
//   gazoblok: gazoblok_orders, gazoblok_order_lines, gazoblok_payments,
//             gazoblok_order_events, gazoblok_products, gazoblok_stock,
//             gazoblok_stock_movements, gazoblok_production_entries,
//             gazoblok_production_lines
//
// Usage:
//   npx tsx scripts/wipe-operational-data.ts           # dry-run (prints counts only)
//   npx tsx scripts/wipe-operational-data.ts --confirm  # actually wipes

import { prisma } from "../src/lib/prisma";

// TRUNCATE … CASCADE is order-independent and also clears any child table
// that references these, so a missed table can't leave orphans. Listed
// explicitly so the dry-run prints a count for every table.
const TABLES_TO_WIPE = [
  // ── Floor (beam-and-block) ──
  "audit_log",
  "notifications",
  "comments",
  "gallery_photos",
  "drawing_requests",
  "stock_movements",
  "production_lines",
  "production_entries",
  "inventory_items",
  "export_events",
  "discrepancies",
  "payments",
  "shipments",
  "dispatches",
  "drivers",
  "order_events",
  "orders",
  "calculations",
  "projects",
  "deals",
  "clients",
  // ── Telegram inbox (models have no @@map → PascalCase table names) ──
  "Message",
  "Conversation",
  // ── Gazoblok (aerated block) line ──
  "gazoblok_order_events",
  "gazoblok_payments",
  "gazoblok_order_lines",
  "gazoblok_orders",
  "gazoblok_stock_movements",
  "gazoblok_production_lines",
  "gazoblok_production_entries",
  "gazoblok_stock",
  "gazoblok_products",
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
