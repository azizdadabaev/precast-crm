export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { CancelOrderSchema } from "@/lib/validation";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { netWrittenOffForOrder, restockForCancellation } from "@/lib/inventory";

const CANCEL_PASSWORD = process.env.ORDER_CANCEL_PASSWORD ?? "etalontbm";

/** Someone else canceled the order between the pre-check and the write. */
class AlreadyCanceled extends Error {}

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
 * deal moves to LOST. Stock: exactly what this order took out of the stock
 * book — per truck at loading, or at delivery — is put back. An order that
 * never wrote stock off restocks nothing.
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

    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        // Conditional claim: the row lock makes a concurrent second cancel match
        // nothing, so the restock below runs exactly once.
        const claimed = await tx.order.updateMany({
          where: { id: existing.id, status: { not: "CANCELED" } },
          data: {
            status: "CANCELED",
            canceledAt: new Date(),
            cancelReason: body.reason ?? null,
          },
        });
        if (claimed.count === 0) throw new AlreadyCanceled();
        const u = await tx.order.findUniqueOrThrow({ where: { id: existing.id } });
        // Mirror exactly what this order wrote off, read from its own
        // movement history (owner rule 2026-10-06) — after the claim.
        const restockLines = await netWrittenOffForOrder(tx, existing.id);
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
              restocked: restockLines.length > 0,
            },
          },
        });
        if (restockLines.length > 0) {
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
    } catch (e) {
      if (e instanceof AlreadyCanceled) return fail("Order is already canceled", 422);
      throw e;
    }

    recordAudit({
      userId: user.id,
      action: "order.cancel",
      targetType: "order",
      targetId: existing.id,
      message: `Canceled ${existing.orderNumber}${body.reason ? `: ${body.reason}` : ""}`,
      metadata: {
        orderNumber: existing.orderNumber,
        previousStatus: existing.status,
        reason: body.reason ?? null,
      },
    });

    return ok(updated);
  },
);
