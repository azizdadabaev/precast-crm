/**
 * One-time backfill for truck fulfilment (spec §9). DRY RUN by default.
 *
 *   npx tsx scripts/backfill-truck-fulfilment.ts            # report only
 *   npx tsx scripts/backfill-truck-fulfilment.ts --apply    # write
 *
 * On the server the runtime image has src/ and tsx but not scripts/, so mount it:
 *   docker compose run --rm --no-deps -v "$PWD/precast-crm/scripts:/app/scripts" \
 *     app npx tsx scripts/backfill-truck-fulfilment.ts
 *
 * 1. Shipment.loadedArea for loaded trucks where it is null (new column only).
 * 2. Stock write-off for trucks already loaded on orders that are not yet
 *    delivered or canceled and have no write-off yet — split trucks per
 *    shipment, single-truck LOADED orders by order lines. Without this they
 *    are written off at «Етказилган», which is still correct, only later.
 */
import { PrismaClient } from "@prisma/client";
import { beamAreaTable, truckArea } from "../src/lib/fulfilment";
import {
  calcSnapshotToInventoryLines,
  decrementForDelivery,
  logStockWarnings,
  shipmentToInventoryLines,
  type InventoryLine,
} from "../src/lib/inventory";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(APPLY ? "== APPLY ==" : "== DRY RUN (nothing is written) ==");

  // 1. m² per loaded truck
  const ships = await prisma.shipment.findMany({
    where: { loadedAt: { not: null }, loadedArea: null },
    select: {
      id: true,
      number: true,
      loadedBeams: true,
      order: {
        select: {
          orderNumber: true,
          project: {
            select: {
              calculations: { select: { beamLength: true, beamCount: true, totalBlocks: true, monolithArea: true } },
            },
          },
        },
      },
    },
  });
  let areaSum = 0;
  for (const s of ships) {
    const table = beamAreaTable(
      s.order.project.calculations.map((c) => ({
        beamLength: Number(c.beamLength),
        beamCount: c.beamCount,
        totalBlocks: c.totalBlocks,
        monolithArea: Number(c.monolithArea),
      })),
    );
    const area = Math.round(truckArea(s.loadedBeams, table) * 1000) / 1000;
    areaSum += area;
    if (APPLY) await prisma.shipment.update({ where: { id: s.id }, data: { loadedArea: area } });
  }
  console.log(`1. loadedArea: ${ships.length} trucks, Σ ${areaSum.toFixed(1)} m²`);

  // 2. stock for trucks already gone on open orders
  const open = await prisma.order.findMany({
    where: { status: { notIn: ["DELIVERED", "CANCELED", "DRAFT"] } },
    select: {
      id: true,
      orderNumber: true,
      loadedAt: true,
      project: { select: { calculations: true } },
      shipments: {
        where: { loadedAt: { not: null } },
        select: { id: true, number: true, loadedBeams: true, loadedBlocks: true },
      },
      stockMovements: { where: { reason: "DELIVERY" }, select: { shipmentId: true } },
    },
  });
  let loads = 0;
  for (const o of open) {
    const done = new Set(o.stockMovements.map((m) => m.shipmentId));
    const work: Array<{ label: string; shipmentId: string | null; lines: InventoryLine[] }> = [];
    if (o.shipments.length > 0) {
      for (const s of o.shipments) {
        if (done.has(s.id)) continue;
        work.push({
          label: `Жўнатма ${s.number} (олдинги юклаш)`,
          shipmentId: s.id,
          lines: shipmentToInventoryLines(s.loadedBeams, s.loadedBlocks),
        });
      }
    } else if (o.loadedAt && o.stockMovements.length === 0) {
      work.push({
        label: "Битта машина (олдинги юклаш)",
        shipmentId: null,
        lines: calcSnapshotToInventoryLines(o.project.calculations),
      });
    }
    for (const w of work) {
      loads += 1;
      const what = w.lines.map((l) => `${l.kind === "BLOCK" ? "ғишт" : `${l.beamLength}м`}×${l.quantity}`).join(", ");
      console.log(`2. ${o.orderNumber} · ${w.label} · ${what}`);
      if (APPLY) {
        await prisma.$transaction(async (tx) => {
          const warnings = await decrementForDelivery(tx, o.id, w.lines, null, { shipmentId: w.shipmentId, note: w.label });
          await logStockWarnings(tx, o.id, warnings);
        });
      }
    }
  }
  console.log(`2. stock: ${loads} truck loads ${APPLY ? "written off" : "would be written off"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
