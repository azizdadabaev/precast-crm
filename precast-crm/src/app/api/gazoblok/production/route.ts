export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, created } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { applyGazoblokMovement } from "@/lib/gazoblok-stock";
import { GazoblokProductionSchema } from "@/lib/gazoblok-validation";

/** GET /api/gazoblok/production — gazoblok.view. Recent production entries. */
export const GET = withAuth(async () => {
  const entries = await prisma.gazoblokProductionEntry.findMany({
    orderBy: { producedAt: "desc" },
    take: 50,
    include: {
      lines: { include: { product: { select: { id: true, label: true } } } },
      recordedBy: { select: { id: true, name: true } },
    },
  });
  return ok(entries);
});

/** POST /api/gazoblok/production — gazoblok.production. Log a day's output;
 *  increments stock per line via the ledger. */
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const body = GazoblokProductionSchema.parse(await req.json());
  const entry = await prisma.$transaction(async (tx) => {
    const e = await tx.gazoblokProductionEntry.create({
      data: {
        producedAt: body.producedAt ?? new Date(),
        recordedById: user.id,
        notes: body.notes ?? null,
        lines: { create: body.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })) },
      },
    });
    for (const l of body.lines) {
      await applyGazoblokMovement(tx, l.productId, l.quantity, {
        reason: "PRODUCTION",
        productionEntryId: e.id,
        actorId: user.id,
      });
    }
    return e;
  });
  recordAudit({
    userId: user.id,
    action: "gazoblok.production.log",
    targetType: "gazoblok_production_entry",
    targetId: entry.id,
    message: `Logged газоблок production (${body.lines.length} sizes)`,
  });
  return created(entry);
});
