/**
 * One-time reconciliation for per-truck gazoblok stock (renovation Stage 1, spec §4.9).
 * DRY RUN by default.
 *
 *   npx tsx scripts/gazoblok-reconcile-stock.ts                                   # report only
 *   npx tsx scripts/gazoblok-reconcile-stock.ts --apply                           # write
 *   npx tsx scripts/gazoblok-reconcile-stock.ts --apply --include-canceled=B-2026-07-0003,B-2026-08-0011
 *   npx tsx scripts/gazoblok-reconcile-stock.ts --undo=scripts/gazoblok-reconcile-undo-<ts>.json          # check + show
 *   npx tsx scripts/gazoblok-reconcile-stock.ts --undo=scripts/gazoblok-reconcile-undo-<ts>.json --apply  # replay
 *
 * On the server the runtime image has src/ and tsx but not scripts/, so mount it:
 *   docker compose run --rm --no-deps -v "$PWD/precast-crm/scripts:/app/scripts" \
 *     app npx tsx scripts/gazoblok-reconcile-stock.ts
 *
 * 1. Writes off blocks already loaded on OPEN orders (they left the yard before
 *    stock started moving per truck). Delivered orders are already written off.
 * 2. Cancelled orders with loaded trucks are only LISTED unless named.
 * 3. Backfills GazoblokOrder.createdById (selling operator) from ORDER_PLACED.
 * --apply plans and writes in ONE transaction, and writes an undo file with the inverse
 * movements next to the script before the transaction commits.
 * --undo=<file> replays such a file as SHIPMENT_CORRECTION movements ("reconcile undo").
 * It is refused unless every line cancels one movement the reconcile posted and none was
 * undone before. Dry run unless --apply; the replay is one transaction. It does not undo
 * the selling-operator backfill.
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { invertMoves, lockReconcile, planStockReconcile, planUndo, RECONCILE_NOTE, UNDO_NOTE } from "../src/lib/gazoblok-reconcile";
import { applyGazoblokMovement } from "../src/lib/gazoblok-stock";

type Db = Prisma.TransactionClient;

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const namedArg = process.argv.find((a) => a.startsWith("--include-canceled="));
const NAMED = new Set((namedArg?.split("=")[1] ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const UNDO_FILE = process.argv.find((a) => a.startsWith("--undo="))?.slice("--undo=".length);

async function loadPlan(db: Db) {
  const orders = await db.gazoblokOrder.findMany({
    select: {
      id: true,
      orderNumber: true,
      status: true,
      createdById: true,
      lines: { select: { id: true, productId: true, productLabel: true } },
      shipments: { select: { id: true, number: true, status: true, loadedLines: true } },
      stockMovements: { select: { shipmentId: true, productId: true, change: true, reason: true } },
      events: { where: { type: "ORDER_PLACED" }, select: { actorId: true }, take: 1, orderBy: { createdAt: "asc" } },
    },
    orderBy: { placedAt: "asc" },
  });
  return planStockReconcile(
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
}

function report(plan: Awaited<ReturnType<typeof loadPlan>>) {
  console.log(`\nStock write-offs for blocks already on trucks (${plan.moves.length}):`);
  for (const m of plan.moves) console.log(`  ${m.orderNumber}  truck ${m.shipmentId.slice(-6)}  ${m.label}  ${m.change}`);
  const total = new Map<string, number>();
  for (const m of plan.moves) total.set(m.label, (total.get(m.label) ?? 0) + m.change);
  for (const [label, n] of total) console.log(`  TOTAL ${label}: ${n}`);

  console.log(`\nCancelled orders that had trucks loaded (NOT changed unless named with --include-canceled):`);
  for (const c of plan.canceledWithLoads) console.log(`  ${c.orderNumber}  ${c.blocks} blocks`);
  if (plan.canceledWithLoads.length === 0) console.log("  none");

  console.log(`\nSelling operator backfill: ${plan.createdByBackfill.length} order(s)`);
}

/** Checks the undo file against what is posted now; throws listing every problem. */
async function checkUndo(db: Db, file: unknown) {
  const shipmentIds = Array.isArray(file)
    ? [...new Set(file.map((m) => (m && typeof m === "object" ? (m as { shipmentId?: unknown }).shipmentId : null)))].filter(
        (id): id is string => typeof id === "string",
      )
    : [];
  const rows = await db.gazoblokStockMovement.findMany({
    where: { shipmentId: { in: shipmentIds }, note: { in: [RECONCILE_NOTE, UNDO_NOTE] } },
    select: { orderId: true, shipmentId: true, productId: true, change: true, note: true },
  });
  const posted = rows.flatMap((r) =>
    r.orderId && r.shipmentId
      ? [{ orderId: r.orderId, shipmentId: r.shipmentId, productId: r.productId, change: r.change, note: r.note }]
      : [],
  );
  const plan = planUndo(file, posted);
  if ("problems" in plan) throw new Error(`Undo file refused — nothing written:\n  ${plan.problems.join("\n  ")}`);
  return plan.moves;
}

async function undo(fileName: string) {
  const file: unknown = JSON.parse(readFileSync(path.resolve(fileName), "utf8"));
  const moves = await checkUndo(prisma, file);
  console.log(`\nUndo movements (${moves.length}) — SHIPMENT_CORRECTION "${UNDO_NOTE}":`);
  for (const m of moves) {
    const sign = m.change > 0 ? "+" : "";
    console.log(`  order ${m.orderId.slice(-6)}  truck ${m.shipmentId.slice(-6)}  product ${m.productId.slice(-6)}  ${sign}${m.change}`);
  }
  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to write.");
    return;
  }
  await prisma.$transaction(
    async (tx) => {
      await lockReconcile(tx);
      // Re-checked inside the transaction (under the lock) so a racing replay can't post twice.
      for (const m of await checkUndo(tx, file)) {
        await applyGazoblokMovement(tx, m.productId, m.change, {
          reason: "SHIPMENT_CORRECTION",
          orderId: m.orderId,
          shipmentId: m.shipmentId,
          note: UNDO_NOTE,
        });
      }
    },
    { timeout: 120_000 },
  );
  console.log("\nUndo applied.");
}

async function main() {
  console.log(APPLY ? "== APPLY ==" : "== DRY RUN (nothing is written) ==");
  if (UNDO_FILE) return undo(UNDO_FILE);

  if (!APPLY) {
    report(await loadPlan(prisma));
    console.log("\nDry run only. Re-run with --apply to write.");
    return;
  }
  const undoFile = path.join(__dirname, `gazoblok-reconcile-undo-${Date.now()}.json`);
  // Plan inside the transaction so what is written is what was planned.
  const moves = await prisma.$transaction(
    async (tx) => {
      await lockReconcile(tx);
      const plan = await loadPlan(tx);
      report(plan);
      for (const m of plan.moves) {
        await applyGazoblokMovement(tx, m.productId, m.change, {
          reason: "SHIPMENT_LOAD",
          orderId: m.orderId,
          shipmentId: m.shipmentId,
          note: RECONCILE_NOTE,
        });
      }
      for (const b of plan.createdByBackfill) {
        await tx.gazoblokOrder.update({ where: { id: b.orderId }, data: { createdById: b.userId } });
      }
      // Written before commit: if the undo file can't be written, nothing is applied.
      writeFileSync(undoFile, JSON.stringify(invertMoves(plan.moves), null, 2));
      return plan.moves;
    },
    { timeout: 120_000 },
  );
  console.log(`\nApplied ${moves.length} movement(s). Undo (inverse movements) written to ${undoFile}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
