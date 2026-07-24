export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, created, fail } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { applyGazoblokMovement } from "@/lib/gazoblok-stock";
import {
  GazoblokProductionSchema,
  GazoblokProductionActionSchema,
} from "@/lib/gazoblok-validation";

/** GET /api/gazoblok/production — auth-only (open to all logged-in users —
 *  owner decision). Recent production entries. */
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

/** POST /api/gazoblok/production — auth-only (open to all logged-in users —
 *  owner decision). Log a day's output; increments stock per line via the
 *  ledger. */
export const POST = withAuth(async (req: NextRequest, { user }) => {
  const body = GazoblokProductionSchema.parse(await req.json());
  const productIds = Array.from(new Set(body.lines.map((l) => l.productId)));
  const products = await prisma.gazoblokProduct.findMany({
    where: { id: { in: productIds } },
    select: { id: true },
  });
  const known = new Set(products.map((p) => p.id));
  for (const l of body.lines) {
    if (!known.has(l.productId)) {
      return fail(`Маҳсулот топилмади · Product not found: ${l.productId}`, 422);
    }
  }
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

/** PATCH /api/gazoblok/production — auth-only (open to all logged-in users —
 *  owner decision). Void a production entry: posts one reversing stock
 *  movement per line so a mistyped entry can be undone without a manual
 *  adjustment. Idempotent via a compare-and-set on voidedAt. */
export const PATCH = withAuth(async (req: NextRequest, { user }) => {
  const body = GazoblokProductionActionSchema.parse(await req.json());

  try {
    await prisma.$transaction(async (tx) => {
      // Compare-and-set: only the first void wins. count === 0 means the
      // entry is already voided (or does not exist) — both map to 409.
      const cas = await tx.gazoblokProductionEntry.updateMany({
        where: { id: body.entryId, voidedAt: null },
        data: { voidedAt: new Date(), voidedById: user.id },
      });
      if (cas.count === 0) throw new Error("GAZOBLOK_PRODUCTION_ALREADY_VOIDED");

      const lines = await tx.gazoblokProductionLine.findMany({
        where: { entryId: body.entryId },
        select: { productId: true, quantity: true },
      });
      for (const line of lines) {
        await applyGazoblokMovement(tx, line.productId, -line.quantity, {
          reason: "MANUAL_ADJUSTMENT",
          productionEntryId: body.entryId,
          actorId: user.id,
          note: "production void",
        });
      }
    });
  } catch (e) {
    if (e instanceof Error && e.message === "GAZOBLOK_PRODUCTION_ALREADY_VOIDED") {
      return fail("Аллақачон бекор қилинган · Already voided", 409);
    }
    throw e;
  }

  recordAudit({
    userId: user.id,
    action: "gazoblok.production.void",
    targetType: "gazoblok_production_entry",
    targetId: body.entryId,
    message: `Voided газоблок production entry`,
  });
  return ok({ id: body.entryId });
});
