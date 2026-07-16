// Worker thread for the owner's Excel backup (GET /api/orders/export).
//
// ExcelJS builds + serializes the workbook synchronously; on the single-CPU
// prod host that used to run on the main event loop and freeze every user's
// requests for the duration. The route (route.ts) does the Prisma query and
// row flattening, then hands the plain rows here so the CPU-heavy part runs
// off the event loop.
//
// Plain CommonJS on purpose: loaded by path at runtime (worker_threads), not
// bundled by Next — it resolves exceljs from node_modules, which the prod
// image ships in full.
"use strict";

const { parentPort, workerData } = require("worker_threads");
const ExcelJS = require("exceljs");

const COLUMNS = [
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

async function build() {
  const { statusOrder, rows } = workerData;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Precast CRM";
  wb.created = new Date();

  for (const status of statusOrder) {
    const statusRows = rows.filter((r) => r.status === status);
    const sheet = wb.addWorksheet(status);
    sheet.columns = COLUMNS;
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E7EB" },
    };

    for (const r of statusRows) sheet.addRow(r);

    // Empty sheets get a "(no orders)" row so the workbook structure
    // is self-documenting even when a status has nothing in it.
    if (statusRows.length === 0) {
      sheet.addRow({ orderNumber: "(no orders)" });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  parentPort.postMessage(Buffer.from(buf));
}

build().catch((err) => {
  // Rethrow asynchronously so the worker exits nonzero and the route's
  // 'error' handler fires with the real message.
  setImmediate(() => {
    throw err;
  });
});
