/**
 * One-time reconciliation for per-truck gazoblok stock (renovation Stage 1, spec §4.9).
 * DRY RUN by default.
 *
 *   npx tsx scripts/gazoblok-reconcile-stock.ts                                   # report only
 *   npx tsx scripts/gazoblok-reconcile-stock.ts --apply                           # write
 *   npx tsx scripts/gazoblok-reconcile-stock.ts --apply --include-canceled=B-2026-07-0003,B-2026-08-0011
 *
 * On the server the runtime image has src/ and tsx but not scripts/, so mount it:
 *   docker compose run --rm --no-deps -v "$PWD/precast-crm/scripts:/app/scripts" \
 *     app npx tsx scripts/gazoblok-reconcile-stock.ts
 *
 * 1. Writes off blocks already loaded on OPEN orders (they left the yard before
 *    stock started moving per truck). Delivered orders are already written off.
 * 2. Cancelled orders with loaded trucks are only LISTED unless named.
 * 3. Backfills GazoblokOrder.createdById (selling operator) from ORDER_PLACED.
 * --apply writes an undo file with the inverse movements next to the script.
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "fs";
import path from "path";
import { planStockReconcile } from "../src/lib/gazoblok-reconcile";
import { applyGazoblokMovement } from "../src/lib/gazoblok-stock";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const namedArg = process.argv.find((a) => a.startsWith("--include-canceled="));
const NAMED = new Set((namedArg?.split("=")[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean));

async function main() {
  console.log(APPLY ? "== APPLY ==" : "== DRY RUN (nothing is written) ==");
  const orders = await prisma.gazoblokOrder.findMany({
    select: {
      id: true,
      orderNumber: true,
      status: true,
      createdById: true,
      lines: { select: { id: true, productId: true, productLabel: true } },
      shipments: { select: { id: true, number: true, status: true, loadedLines: true } },
      stockMovements: { select: { shipmentId: true, productId: true, change: true } },
      events: { where: { type: "ORDER_PLACED" }, select: { actorId: true }, take: 1, orderBy: { createdAt: "asc" } },
    },
    orderBy: { placedAt: "asc" },
  });
  const plan = planStockReconcile(
    orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      lines: o.lines,
      shipments: o.shipments,
      movements: o.stockMovements,
      placedEventActorId: o.events[0]?.actorId ?? null,
      createdById: o.createdById,
    })),
    NAMED,
  );

  console.log(`\nStock write-offs for blocks already on trucks (${plan.moves.length}):`);
  for (const m of plan.moves) console.log(`  ${m.orderNumber}  truck ${m.shipmentId.slice(-6)}  ${m.label}  ${m.change}`);
  const total = new Map<string, number>();
  for (const m of plan.moves) total.set(m.label, (total.get(m.label) ?? 0) + m.change);
  for (const [label, n] of total) console.log(`  TOTAL ${label}: ${n}`);

  console.log(`\nCancelled orders that had trucks loaded (NOT changed unless named with --include-canceled):`);
  for (const c of plan.canceledWithLoads) console.log(`  ${c.orderNumber}  ${c.blocks} blocks`);
  if (plan.canceledWithLoads.length === 0) console.log("  none");

  console.log(`\nSelling operator backfill: ${plan.createdByBackfill.length} order(s)`);

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to write.");
    return;
  }
  await prisma.$transaction(async (tx) => {
    for (const m of plan.moves) {
      await applyGazoblokMovement(tx, m.productId, m.change, {
        reason: "SHIPMENT_LOAD",
        orderId: m.orderId,
        shipmentId: m.shipmentId,
        note: "Renovation reconcile: loaded before per-truck stock",
      });
    }
    for (const b of plan.createdByBackfill) {
      await tx.gazoblokOrder.update({ where: { id: b.orderId }, data: { createdById: b.userId } });
    }
  }, { timeout: 120_000 });
  const undo = path.join(__dirname, `gazoblok-reconcile-undo-${Date.now()}.json`);
  writeFileSync(undo, JSON.stringify(plan.moves.map((m) => ({ ...m, change: -m.change })), null, 2));
  console.log(`\nApplied. Undo (inverse movements) written to ${undo}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
