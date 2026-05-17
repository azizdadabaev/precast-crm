export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
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
 */
const STATUS_ORDER = [
  "PLACED",
  "IN_PRODUCTION",
  "DISPATCHED",
  "DELIVERED",
  "CANCELED",
] as const;

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

    const wb = new ExcelJS.Workbook();
    wb.creator = "Precast CRM";
    wb.created = new Date();

    for (const status of STATUS_ORDER) {
      const rows = orders.filter((o) => o.status === status);
      const sheet = wb.addWorksheet(status);
      sheet.columns = [
        { header: "Order #", key: "orderNumber", width: 14 },
        { header: "Status", key: "status", width: 14 },
        { header: "Payment state", key: "paymentState", width: 18 },
        { header: "Client name", key: "clientName", width: 28 },
        { header: "Client phone", key: "clientPhone", width: 16 },
        { header: "Client address", key: "clientAddress", width: 36 },
        { header: "Project name", key: "projectName", width: 24 },
        { header: "Draft #", key: "draftNumber", width: 10 },
        { header: "Scheduled at", key: "scheduledAt", width: 18 },
        { header: "Placed at", key: "placedAt", width: 18 },
        { header: "Delivered at", key: "deliveredAt", width: 18 },
        { header: "Canceled at", key: "canceledAt", width: 18 },
        { header: "Cancel reason", key: "cancelReason", width: 28 },
        { header: "Rooms subtotal", key: "roomsSubtotal", width: 16 },
        { header: "Discount %", key: "discountPercent", width: 12 },
        { header: "Discount amount", key: "discountAmount", width: 16 },
        { header: "Delivery cost", key: "deliveryCost", width: 14 },
        { header: "Other cost", key: "otherCost", width: 14 },
        { header: "Total price", key: "totalPrice", width: 16 },
        { header: "Confirmed paid", key: "confirmedPaid", width: 16 },
        { header: "Pending paid", key: "pendingPaid", width: 16 },
        { header: "Remaining", key: "remaining", width: 16 },
        { header: "Total area (m²)", key: "totalArea", width: 14 },
        { header: "Total blocks", key: "totalBlocks", width: 12 },
        { header: "Total beams", key: "totalBeams", width: 12 },
        { header: "Driver", key: "driver", width: 22 },
        { header: "Truck", key: "truck", width: 14 },
        { header: "Dispatched at", key: "dispatchedAt", width: 18 },
        { header: "Driver returned at", key: "driverReturnedAt", width: 18 },
        { header: "Notes", key: "notes", width: 40 },
        { header: "Order ID", key: "id", width: 28 },
      ];
      sheet.getRow(1).font = { bold: true };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE5E7EB" },
      };

      for (const o of rows) {
        const confirmed = Number(o.confirmedPaid);
        const pending = o.payments
          .filter((p) => p.status === "PENDING_CONFIRMATION")
          .reduce((s, p) => s + Number(p.amount), 0);
        const total = Number(o.totalPrice);
        const remaining = Math.max(0, total - confirmed - pending);
        sheet.addRow({
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
        });
      }

      // Empty sheets get a "(no orders)" row so the workbook structure
      // is self-documenting even when a status has nothing in it.
      if (rows.length === 0) {
        sheet.addRow({ orderNumber: "(no orders)" });
      }
    }

    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
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
