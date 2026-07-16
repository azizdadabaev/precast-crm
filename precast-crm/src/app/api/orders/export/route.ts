export const dynamic = "force-dynamic";

import path from "path";
import { Worker } from "worker_threads";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPermission } from "@/lib/api-auth";

/**
 * GET /api/orders/export
 *
 * Owner-only backup. Streams an .xlsx workbook with one sheet per order
 * status (PLACED / IN_PRODUCTION / DISPATCHED / DELIVERED / CANCELED).
 * Each sheet sorts rows by orderNumber ascending so historical snapshots
 * are stable and comparable across exports.
 *
 * Columns are denormalized — client, totals, schedule, payment state
 * fit on one row so the workbook is self-contained without follow-up
 * lookups. Payments and dispatches are rolled up into summary columns
 * to keep the workbook readable; the order detail page is the source
 * of truth for the per-payment trail.
 *
 * The ExcelJS workbook build runs in a worker thread
 * (src/workers/order-export-worker.js) — it's CPU-bound, and on the
 * single-vCPU prod host running it on the event loop froze every other
 * user's requests for the duration of the export.
 */
const STATUS_ORDER = [
  "PLACED",
  "IN_PRODUCTION",
  "DISPATCHED",
  "DELIVERED",
  "CANCELED",
] as const;

function buildWorkbookInWorker(rows: unknown[]): Promise<Buffer> {
  // Resolved at runtime (never bundled): dev cwd is precast-crm/, prod
  // cwd is /app — both have src/workers/ on disk.
  const workerPath = path.join(
    process.cwd(),
    "src",
    "workers",
    "order-export-worker.js",
  );
  return new Promise<Buffer>((resolve, reject) => {
    const worker = new Worker(workerPath, {
      workerData: { statusOrder: STATUS_ORDER, rows },
    });
    let settled = false;
    worker.once("message", (buf: Buffer) => {
      settled = true;
      resolve(buf);
      void worker.terminate();
    });
    worker.once("error", (err) => {
      settled = true;
      reject(err);
    });
    worker.once("exit", (code) => {
      if (!settled) reject(new Error(`export worker exited with code ${code}`));
    });
  });
}

export const GET = withPermission(
  "order.exportBackup",
  async (_req: NextRequest) => {
    const orders = await prisma.order.findMany({
      take: 10_000,
      orderBy: [{ status: "asc" }, { orderNumber: "asc" }],
      include: {
        client: { select: { name: true, phone: true, address: true } },
        project: { select: { name: true, draftNumber: true } },
        payments: { select: { amount: true, status: true, method: true } },
        dispatch: {
          select: {
            truckIdentifier: true,
            dispatchedAt: true,
            returnedAt: true,
            driver: { select: { name: true, phone: true } },
          },
        },
      },
    });

    // Flatten to plain structured-cloneable rows here (Prisma Decimal
    // instances don't survive the worker boundary); the worker only
    // does the CPU-heavy workbook build + serialize.
    const rows = orders.map((o) => {
      const confirmed = Number(o.confirmedPaid);
      const pending = o.payments
        .filter((p) => p.status === "PENDING_CONFIRMATION")
        .reduce((s, p) => s + Number(p.amount), 0);
      const total = Number(o.totalPrice);
      const remaining = Math.max(
        0,
        total - confirmed - pending - Number(o.writeOffAmount),
      );
      return {
        orderNumber: o.orderNumber,
        status: o.status,
        paymentState: o.paymentState,
        clientName: o.client?.name ?? "",
        clientPhone: o.client?.phone ?? "",
        clientAddress: o.client?.address ?? "",
        projectName: o.project?.name ?? "",
        draftNumber: o.project?.draftNumber ?? "",
        scheduledAt: o.scheduledAt,
        placedAt: o.placedAt,
        deliveredAt: o.deliveredAt,
        canceledAt: o.canceledAt,
        cancelReason: o.cancelReason ?? "",
        roomsSubtotal: Number(o.roomsSubtotal),
        discountPercent: Number(o.discountPercent),
        discountAmount: Number(o.discountAmount),
        deliveryCost: Number(o.deliveryCost),
        otherCost: Number(o.otherCost),
        totalPrice: total,
        confirmedPaid: confirmed,
        pendingPaid: pending,
        remaining,
        totalArea: Number(o.totalArea),
        totalBlocks: o.totalBlocks,
        totalBeams: o.totalBeams,
        driver: o.dispatch?.driver?.name ?? "",
        truck: o.dispatch?.truckIdentifier ?? "",
        dispatchedAt: o.dispatch?.dispatchedAt ?? "",
        driverReturnedAt: o.dispatch?.returnedAt ?? "",
        notes: o.notes ?? "",
        id: o.id,
      };
    });

    const buf = await buildWorkbookInWorker(rows);
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="orders-backup-${stamp}.xlsx"`,
        "Content-Length": String(buf.byteLength),
        "Cache-Control": "private, no-cache",
      },
    });
  },
);
