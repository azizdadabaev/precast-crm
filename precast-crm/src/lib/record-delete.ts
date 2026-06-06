// Hard-delete helpers for the owner-only "remove test data" buttons.
//
// These compose DOWNWARD through the ownership hierarchy
// (client → project → order) and MUST run inside a prisma.$transaction
// so a half-finished delete can never leave dangling rows.
//
// FK rules that dictate the order (see schema.prisma):
//   - Order→Project and Order→Client are RESTRICT (required relations) →
//     an order must be deleted BEFORE its project/client.
//   - An order's events/payments/dispatch/shipments/discrepancies/comments/
//     galleryPhotos are onDelete:Cascade → order.delete() clears them.
//     stockMovements + drawingRequests are SetNull (survive, harmless).
//   - A project's calculations + comments are Cascade.
//   - A client's deals are Cascade, but its projects are SetNull (would be
//     orphaned) → delete the projects first.
//   - GazoblokOrder→Client is RESTRICT → delete the client's gazoblok
//     orders too (their lines/payments/events cascade).
//   - Notifications are polymorphic (no FK), so they never block a delete;
//     we clear them explicitly so the bell doesn't show dead links.

import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** Delete one order + everything that belongs to it. */
export async function deleteOrderCascade(tx: Tx, orderId: string): Promise<void> {
  await tx.notification.deleteMany({ where: { orderId } });
  await tx.order.delete({ where: { id: orderId } });
}

/** Delete one saved project (taking its 0-or-1 order with it). */
export async function deleteProjectCascade(tx: Tx, projectId: string): Promise<void> {
  // projectId is @unique on Order, so there's at most one.
  const order = await tx.order.findUnique({
    where: { projectId },
    select: { id: true },
  });
  if (order) await deleteOrderCascade(tx, order.id);
  await tx.notification.deleteMany({ where: { projectId } });
  await tx.project.delete({ where: { id: projectId } });
}

/** Delete one client + its entire CRM footprint (deals, projects, orders). */
export async function deleteClientCascade(tx: Tx, clientId: string): Promise<void> {
  const projects = await tx.project.findMany({
    where: { clientId },
    select: { id: true },
  });
  for (const p of projects) await deleteProjectCascade(tx, p.id);

  // Defensive: any order still pointing at this client but not reached via
  // one of its projects (shouldn't happen, but RESTRICT would block us).
  const strayOrders = await tx.order.findMany({
    where: { clientId },
    select: { id: true },
  });
  for (const o of strayOrders) await deleteOrderCascade(tx, o.id);

  // Gazoblok orders are RESTRICT on client too; their lines/payments/events
  // cascade off the gazoblok order itself.
  const gazoblokOrders = await tx.gazoblokOrder.findMany({
    where: { clientId },
    select: { id: true },
  });
  for (const g of gazoblokOrders) {
    await tx.gazoblokOrder.delete({ where: { id: g.id } });
  }

  await tx.client.delete({ where: { id: clientId } }); // deals cascade
}
