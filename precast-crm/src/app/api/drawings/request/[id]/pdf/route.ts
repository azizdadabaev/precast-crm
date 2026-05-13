import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { withPermission } from "@/lib/api-auth";

const DRAWINGS_DIR = process.env.DRAWINGS_DIR ?? "/data/drawings";

/**
 * GET /api/drawings/request/[id]/pdf
 *
 * Streams the generated PDF to the browser as an attachment.
 * Returns 404 when the request hasn't been delivered yet or has no PDF.
 * Gated on blender.bridge permission — same as the request endpoint.
 */
export const GET = withPermission<{ id: string }>(
  "blender.bridge",
  async (_req: NextRequest, { params }) => {
    const row = await prisma.drawingRequest.findUnique({
      where:  { id: params.id },
      select: {
        status:       true,
        pdfStorageKey: true,
        order:        { select: { orderNumber: true } },
      },
    });

    if (!row || !row.pdfStorageKey) {
      return NextResponse.json(
        { ok: false, error: "PDF not available yet" },
        { status: 404 },
      );
    }

    const filePath = path.join(DRAWINGS_DIR, path.basename(row.pdfStorageKey));
    let buf: Buffer;
    try {
      buf = await fs.promises.readFile(filePath);
    } catch {
      return NextResponse.json(
        { ok: false, error: "PDF file not found on server" },
        { status: 404 },
      );
    }

    const filename = row.order?.orderNumber
      ? `Drawing-${row.order.orderNumber}.pdf`
      : `Drawing-${params.id}.pdf`;

    return new NextResponse(new Uint8Array(buf), {
      status:  200,
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length":      String(buf.length),
        "Cache-Control":       "private, no-cache",
      },
    });
  },
);
