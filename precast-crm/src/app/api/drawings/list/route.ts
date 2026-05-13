import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPermission } from "@/lib/api-auth";

/**
 * GET /api/drawings/list?orderId=X
 * GET /api/drawings/list?projectId=X
 *
 * Returns all DrawingRequest rows for an order or project, newest first.
 * Used by the Drawings section on order and project detail pages.
 */
export const GET = withPermission(
  "blender.bridge",
  async (req: NextRequest) => {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId");
    const projectId = searchParams.get("projectId");

    if (!orderId && !projectId) {
      return NextResponse.json(
        { ok: false, error: "Provide orderId or projectId" },
        { status: 400 },
      );
    }

    const rows = await prisma.drawingRequest.findMany({
      where: orderId ? { orderId } : { projectId: projectId! },
      orderBy: { createdAt: "desc" },
      select: {
        id:           true,
        status:       true,
        createdAt:    true,
        deliveredAt:  true,
        errorMessage: true,
        pdfStorageKey: true,
        pdfSizeBytes:  true,
        pageCount:     true,
        renderMs:      true,
        createdBy:    { select: { name: true } },
      },
    });

    return NextResponse.json(rows);
  },
);
