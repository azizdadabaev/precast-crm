import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { withPermission } from "@/lib/api-auth";

const DRAWINGS_DIR = process.env.DRAWINGS_DIR ?? "/data/drawings";

/**
 * DELETE /api/drawings/request/[id]/delete
 *
 * Hard-deletes a DrawingRequest: removes the PDF file from disk and
 * purges the DB row entirely. No traces remain.
 * Gated on blender.bridge (owner-only).
 */
export const DELETE = withPermission<{ id: string }>(
  "blender.bridge",
  async (_req: NextRequest, { params }) => {
    const row = await prisma.drawingRequest.findUnique({
      where:  { id: params.id },
      select: { id: true, pdfStorageKey: true },
    });

    if (!row) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    // Delete the file first — if it fails for any reason other than
    // "already gone" we still purge the DB row so the UI clears.
    if (row.pdfStorageKey) {
      const filePath = path.join(DRAWINGS_DIR, path.basename(row.pdfStorageKey));
      try {
        await fs.promises.unlink(filePath);
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error("[drawings] unlink failed:", err);
        }
      }
    }

    await prisma.drawingRequest.delete({ where: { id: params.id } });

    return NextResponse.json({ ok: true });
  },
);
