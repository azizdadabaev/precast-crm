// Backfill GalleryPhoto rows from existing Order.loadedPhotoUrl,
// Order.deliveryProofUrl, and Shipment.loadedPhotoUrl values.
//
// Idempotent — skips any (orderId, kind, url) that already has a row.
//
// Usage:
//   npx tsx scripts/backfill-gallery-photos.ts

import { prisma } from "../src/lib/prisma";

async function main() {
  let insertedLoaded = 0;
  let insertedDelivery = 0;
  let insertedShipment = 0;
  let skipped = 0;

  // Order.loadedPhotoUrl → LOADED
  const ordersLoaded = await prisma.order.findMany({
    where: { loadedPhotoUrl: { not: null } },
    select: { id: true, loadedPhotoUrl: true, loadedAt: true },
  });
  for (const o of ordersLoaded) {
    const url = o.loadedPhotoUrl!;
    const exists = await prisma.galleryPhoto.findFirst({
      where: { orderId: o.id, kind: "LOADED", url },
      select: { id: true },
    });
    if (exists) {
      skipped++;
      continue;
    }
    await prisma.galleryPhoto.create({
      data: {
        orderId: o.id,
        kind: "LOADED",
        url,
        uploadedAt: o.loadedAt ?? new Date(),
      },
    });
    insertedLoaded++;
  }

  // Order.deliveryProofUrl → DELIVERY_PROOF
  const ordersDelivered = await prisma.order.findMany({
    where: { deliveryProofUrl: { not: null } },
    select: { id: true, deliveryProofUrl: true, deliveryProofUploadedAt: true },
  });
  for (const o of ordersDelivered) {
    const url = o.deliveryProofUrl!;
    const exists = await prisma.galleryPhoto.findFirst({
      where: { orderId: o.id, kind: "DELIVERY_PROOF", url },
      select: { id: true },
    });
    if (exists) {
      skipped++;
      continue;
    }
    await prisma.galleryPhoto.create({
      data: {
        orderId: o.id,
        kind: "DELIVERY_PROOF",
        url,
        uploadedAt: o.deliveryProofUploadedAt ?? new Date(),
      },
    });
    insertedDelivery++;
  }

  // Shipment.loadedPhotoUrl → SHIPMENT_LOADED
  const shipments = await prisma.shipment.findMany({
    where: { loadedPhotoUrl: { not: null } },
    select: { id: true, orderId: true, loadedPhotoUrl: true, loadedAt: true },
  });
  for (const s of shipments) {
    const url = s.loadedPhotoUrl!;
    const exists = await prisma.galleryPhoto.findFirst({
      where: { orderId: s.orderId, kind: "SHIPMENT_LOADED", url },
      select: { id: true },
    });
    if (exists) {
      skipped++;
      continue;
    }
    await prisma.galleryPhoto.create({
      data: {
        orderId: s.orderId,
        shipmentId: s.id,
        kind: "SHIPMENT_LOADED",
        url,
        uploadedAt: s.loadedAt ?? new Date(),
      },
    });
    insertedShipment++;
  }

  console.log("Backfill complete:");
  console.log(`  LOADED:          ${insertedLoaded}`);
  console.log(`  DELIVERY_PROOF:  ${insertedDelivery}`);
  console.log(`  SHIPMENT_LOADED: ${insertedShipment}`);
  console.log(`  Skipped (already present): ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
