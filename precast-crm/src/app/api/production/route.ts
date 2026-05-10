export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ProductionEntryCreateSchema } from "@/lib/validation";
import { ok, created } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import {
  applyStockMovement,
  canonicalBeamLength,
  type InventoryKind,
} from "@/lib/inventory";

/**
 * GET /api/production?days=14 — inventory.view
 * List recent ProductionEntries with their lines, newest first.
 */
export const GET = withPermission("inventory.view", async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const days = Math.min(180, Math.max(1, Number(searchParams.get("days") ?? 14)));
  const since = new Date();
  since.setDate(since.getDate() - days);

  const entries = await prisma.productionEntry.findMany({
    where: { producedAt: { gte: since } },
    orderBy: { producedAt: "desc" },
    include: {
      lines: true,
      recordedBy: { select: { id: true, name: true, email: true } },
    },
  });
  return ok(entries);
});

/**
 * POST /api/production — inventory.manage
 *
 * Atomically:
 *   1. Insert the ProductionEntry (with the operator who logged it).
 *   2. Insert each ProductionLine.
 *   3. For each line, upsert the matching InventoryItem and create a
 *      StockMovement (reason = PRODUCTION) so the audit trail captures
 *      where the increment came from.
 */
export const POST = withPermission("inventory.manage", async (req: NextRequest, { user }) => {
  const body = ProductionEntryCreateSchema.parse(await req.json());

  const entry = await prisma.$transaction(async (tx) => {
    const producedAt = body.producedAt ?? new Date();

    const e = await tx.productionEntry.create({
      data: {
        producedAt,
        notes: body.notes ?? null,
        recordedById: user.id,
      },
    });

    for (const line of body.lines) {
      const beamLength =
        line.kind === "BEAM" && line.beamLength != null
          ? canonicalBeamLength(line.beamLength)
          : null;

      await tx.productionLine.create({
        data: {
          productionEntryId: e.id,
          kind: line.kind as InventoryKind,
          beamLength: beamLength as never,
          quantity: line.quantity,
        },
      });

      await applyStockMovement(
        tx,
        { kind: line.kind as InventoryKind, beamLength, quantity: line.quantity },
        line.quantity,
        {
          reason: "PRODUCTION",
          productionEntryId: e.id,
          actorId: user.id,
        },
      );
    }

    return tx.productionEntry.findUniqueOrThrow({
      where: { id: e.id },
      include: {
        lines: true,
        recordedBy: { select: { id: true, name: true, email: true } },
      },
    });
  });

  return created(entry);
});
