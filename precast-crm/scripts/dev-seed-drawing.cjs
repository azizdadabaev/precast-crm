// LOCAL DEV ONLY — seeds DELIVERED DrawingRequest rows with a real sample PDF
// so the "Send PDF" feature can be tested without a live Blender connection.
// Run from the inner precast-crm folder: node scripts/dev-seed-drawing.cjs
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");

// Must match the app's resolution (src/app/api/inbox/[id]/reply-document +
// /api/drawings/request/[id]/pdf): process.env.DRAWINGS_DIR ?? "/data/drawings".
const DRAWINGS_DIR = process.env.DRAWINGS_DIR || "/data/drawings";

function escapePdf(s) {
  return String(s).replace(/([()\\])/g, "\\$1");
}

/** Build a minimal but valid one-page PDF with correct xref byte offsets. */
function buildSimplePdf(title, line2) {
  const bodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const content =
    `BT /F1 24 Tf 60 760 Td (${escapePdf(title)}) Tj ` +
    `/F1 13 Tf 0 -36 Td (${escapePdf(line2)}) Tj ` +
    `0 -22 Td (Local test PDF \\055 no Blender connection) Tj ET`;
  bodies.push(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  bodies.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf, "latin1");
  let xref = `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => {
    xref += String(o).padStart(10, "0") + " 00000 n \n";
  });
  pdf += xref + `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

(async () => {
  const prisma = new PrismaClient();
  try {
    fs.mkdirSync(DRAWINGS_DIR, { recursive: true });

    const user =
      (await prisma.user.findFirst({ where: { role: "OWNER", isActive: true }, select: { id: true } })) ||
      (await prisma.user.findFirst({ where: { isActive: true }, select: { id: true } }));
    if (!user) {
      console.log("No active user found — cannot set createdById.");
      return;
    }

    const projects = await prisma.project.findMany({
      where: { calculations: { some: {} } },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        draftNumber: true,
        status: true,
        orders: { select: { orderNumber: true }, take: 1 },
      },
    });

    for (const pr of projects) {
      const existing = await prisma.drawingRequest.findFirst({
        where: { projectId: pr.id, status: "DELIVERED" },
        select: { id: true },
      });
      if (existing) {
        console.log(`skip ${pr.id} — already has a delivered drawing`);
        continue;
      }
      const row = await prisma.drawingRequest.create({
        data: { projectId: pr.id, roomsJson: "[]", status: "PENDING", createdById: user.id },
        select: { id: true },
      });
      const label =
        pr.status === "ORDERED" && pr.orders[0]
          ? `Order ${pr.orders[0].orderNumber}`
          : pr.draftNumber
            ? `Draft ${String(pr.draftNumber).padStart(4, "0")}D`
            : `Project ${pr.id.slice(-6)}`;
      const pdf = buildSimplePdf("Sample Drawing PDF", label);
      fs.writeFileSync(path.join(DRAWINGS_DIR, `${row.id}.pdf`), pdf);
      await prisma.drawingRequest.update({
        where: { id: row.id },
        data: {
          status: "DELIVERED",
          deliveredAt: new Date(),
          pdfStorageKey: `drawings/${row.id}.pdf`,
          pdfSizeBytes: pdf.length,
          pageCount: 1,
          renderMs: 0,
        },
      });
      console.log(`seeded ${label}  (project ${pr.id}) → ${row.id}.pdf  (${pdf.length} bytes)`);
    }

    // Also attach to a couple of orders (the order page lists drawings by
    // orderId, separate from projectId) so the Order-page Send PDF is testable.
    const orders = await prisma.order.findMany({
      orderBy: { placedAt: "desc" },
      take: 2,
      select: { id: true, orderNumber: true },
    });
    for (const o of orders) {
      const existing = await prisma.drawingRequest.findFirst({
        where: { orderId: o.id, status: "DELIVERED" },
        select: { id: true },
      });
      if (existing) {
        console.log(`skip order ${o.orderNumber} — already has a delivered drawing`);
        continue;
      }
      const row = await prisma.drawingRequest.create({
        data: { orderId: o.id, roomsJson: "[]", status: "PENDING", createdById: user.id },
        select: { id: true },
      });
      const pdf = buildSimplePdf("Sample Drawing PDF", `Order ${o.orderNumber}`);
      fs.writeFileSync(path.join(DRAWINGS_DIR, `${row.id}.pdf`), pdf);
      await prisma.drawingRequest.update({
        where: { id: row.id },
        data: {
          status: "DELIVERED",
          deliveredAt: new Date(),
          pdfStorageKey: `drawings/${row.id}.pdf`,
          pdfSizeBytes: pdf.length,
          pageCount: 1,
          renderMs: 0,
        },
      });
      console.log(`seeded Order ${o.orderNumber}  (order ${o.id}) → ${row.id}.pdf  (${pdf.length} bytes)`);
    }

    console.log(`\nPDFs written to: ${path.resolve(DRAWINGS_DIR)}`);
  } finally {
    await prisma.$disconnect();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
