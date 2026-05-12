import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPermission } from "@/lib/api-auth";

/**
 * GET /api/drawings/request/[id]
 *
 * Poll endpoint used by the SendToBlenderButton to watch a single
 * request through its lifecycle. Scoped to the requesting user via
 * `createdById` so one owner's requests never leak to another (even
 * though only OWNER currently has `blender.bridge`, this future-
 * proofs a multi-owner topology).
 */

export const GET = withPermission<{ id: string }>(
  "blender.bridge",
  async (_req: NextRequest, { user, params }) => {
    const row = await prisma.drawingRequest.findFirst({
      where: { id: params.id, createdById: user.id },
      select: {
        id: true,
        status: true,
        createdAt: true,
        deliveredAt: true,
        errorMessage: true,
        orderId: true,
        projectId: true,
      },
    });

    if (!row) {
      return NextResponse.json(
        { ok: false, error: "Not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(row);
  },
);
