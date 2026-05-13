import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPermission } from "@/lib/api-auth";

/**
 * GET /api/drawings/request/[id]
 *
 * Poll endpoint for watching a DrawingRequest through its lifecycle.
 * Now includes PDF metadata fields so the UI can render a download
 * button as soon as pdfStorageKey is populated.
 */
export const GET = withPermission<{ id: string }>(
  "blender.bridge",
  async (_req: NextRequest, { params }) => {
    const row = await prisma.drawingRequest.findUnique({
      where: { id: params.id },
      select: {
        id:           true,
        status:       true,
        createdAt:    true,
        deliveredAt:  true,
        errorMessage: true,
        orderId:      true,
        projectId:    true,
        pdfStorageKey: true,
        pdfSizeBytes:  true,
        pageCount:     true,
        renderMs:      true,
      },
    });

    if (!row) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(row);
  },
);
