export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { CancelOrderSchema } from "@/lib/validation";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import {
  calcSnapshotToInventoryLines,
  restockForCancellation,
} from "@/lib/inventory";

const CANCEL_PASSWORD = process.env.ORDER_CANCEL_PASSWORD ?? "etalontbm";

/**
 * POST /api/orders/[id]/cancel — order.cancel
 *
 * Defense in depth: only callers with order.cancel can attempt, AND
 * non-OWNER callers must additionally supply the correct cancel
 * password. OWNER bypasses the password (matches the prior ADMIN
 * bypass — the new role layout makes OWNER the bypass holder, since
 * OWNER is the trusted superuser).
 *
 * Effect: order.status = CANCELED, project goes back to DRAFT,
 * deal moves to LOST. Inventory restocked if the order had been
 * DELIVERED.
 */
export const POST = withPermission<{ id: string }>(
  "order.cancel",
  async (req: NextRequest, { user, params }) => {
    const body = CancelOrderSchema.parse(await req.json());

    // Trusted-superuser bypass: OWNER or ADMIN role skips the password,
    // matching prior behavior where ADMIN bypassed. The role check here
    // is intentional metadata-on-template — it's a UX shortcut, not the
    // access control. The access control is the order.cancel permission
    // checked by withPermission above.
    const isTrustedRole = user.role === "OWNER" || user.role === "ADMIN";
    const passwordOk = body.password && body.password === CANCEL_PASSWORD;

    if (!isTrustedRole && !passwordOk) {
      return fail(
        "Бекор қилиш парол талаб қилади · Cancellation requires the cancel password (or OWNER/ADMIN role).",
        403,
      );
    }

    const existing = await prisma.order.findUnique({
      where: { id: params.id },
      include: { project: { select: { id: true, dealId: true } } },
    });
    if (!existing) return fail("Order not found", 404);
    if (existing.status === "CANCELED")
      return fail("Order is already canceled", 422);

    // Mirror the inventory decrement that happened on DELIVERED.
    const wasDelivered = existing.deliveredAt != null;
    let restockLines: ReturnType<typeof calcSnapshotToInventoryLines> = [];
    if (wasDelivered) {
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: existing.projectId },
        include: { calculations: true },
      });
      restockLines = calcSnapshotToInventoryLines(project.calculations);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.order.update({
        where: { id: existing.id },
        data: {
          status: "CANCELED",
          canceledAt: new Date(),
          cancelReason: body.reason ?? null,
        },
      });
      await tx.project.update({
        where: { id: existing.projectId },
        data: { status: "DRAFT" },
      });
      if (existing.project?.dealId) {
        await tx.deal
          .update({
            where: { id: existing.project.dealId },
            data: { stage: "LOST", status: "LOST" },
          })
          .catch(() => null);
      }
      await tx.orderEvent.create({
        data: {
          orderId: existing.id,
          type: "ORDER_CANCELED",
          actorId: user.id,
          message: body.reason ?? null,
          payload: {
            method: isTrustedRole ? "role-bypass" : "password",
            reason: body.reason ?? "",
            restocked: wasDelivered,
          },
        },
      });
      if (wasDelivered) {
        await restockForCancellation(
          tx,
          existing.id,
          restockLines,
          user.id,
          body.reason ?? null,
        );
      }
      return u;
    });

    return ok(updated);
  },
);
