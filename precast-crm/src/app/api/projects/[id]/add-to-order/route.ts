export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { loadPricingConfig } from "@/lib/pricing-config";
import { computeOrderTotals } from "@/lib/order-totals";
import { calcResultToCreatePayload, type RoomInput } from "@/lib/calc-persistence";
import type { Pattern } from "@/services/calculation-engine";

/**
 * POST /api/projects/[id]/add-to-order — order.edit. One-tap "apply this draft
 * to the conversation's existing order" — the operator half of an order-change
 * request the AI agent cannot (and must not claim to) perform itself.
 *
 * Pricing integrity: the order's EXISTING rooms are NOT re-priced — their agreed
 * calculation rows stay untouched. Only the draft's rooms are computed (the same
 * engine + inputs the agent quoted with) and APPENDED, so the order total grows
 * by exactly the amount the customer was quoted. The absolute discount amount is
 * preserved (a negotiated discount doesn't auto-grow); delivery/other unchanged.
 */
export const POST = withPermission<{ id: string }>("order.edit", async (_req: NextRequest, { params, user }) => {
  const draft = await prisma.project.findUnique({
    where: { id: params.id },
    include: { calculations: { orderBy: { seq: "asc" } } },
  });
  if (!draft) return fail("Лойиҳа топилмади · Draft not found", 404);
  if (draft.status !== "DRAFT") return fail("Фақат қоралама лойиҳани қўшиш мумкин · Only a draft can be added to an order", 409);
  if (!draft.conversationId) return fail("Лойиҳа суҳбатга боғланмаган · Draft is not linked to a conversation", 422);
  if (draft.calculations.length === 0) return fail("Лойиҳада хоналар йўқ · Draft has no rooms", 422);

  const order = await prisma.order.findFirst({
    where: {
      project: { conversationId: draft.conversationId },
      status: { in: ["PLACED", "IN_PRODUCTION"] },
    },
    orderBy: { placedAt: "desc" },
    include: { project: { include: { calculations: { orderBy: { seq: "desc" }, take: 1 } } } },
  });
  if (!order) {
    return fail("Бу суҳбатда фаол буюртма топилмади · No active order on this conversation", 404);
  }

  // Recompute ONLY the draft rooms from their persisted inputs (identical to the
  // agent's quote — pattern policy was applied when the draft was saved).
  const rooms: RoomInput[] = draft.calculations.map((c) => ({
    name: c.name,
    innerWidth: Number(c.innerWidth),
    innerLength: Number(c.innerLength),
    bearing: Number(c.bearing),
    correction: Number(c.correction),
    extraBeams: c.extraBeams,
    forceStartBeam: c.forceStartBeam,
    patternOverride: c.patternOverride as Pattern | null,
    m2PriceOverride: c.m2PriceOverride,
    m2PriceOverrideValue: c.m2PriceOverride ? Number(c.m2Price) : null,
    m2PriceReason: c.m2PriceOverride ? c.m2PriceReason : null,
  }));
  const pricing = await loadPricingConfig();
  const added = computeOrderTotals(
    rooms,
    { discountPercent: 0, discountAmount: 0, deliveryCost: 0, otherCost: 0 },
    pricing,
  );

  const startSeq = (order.project.calculations[0]?.seq ?? -1) + 1;
  const newSubtotal = Number(order.roomsSubtotal) + added.roomsSubtotal;
  const discountAmount = Number(order.discountAmount);
  const resolvedPercent =
    discountAmount > 0 && newSubtotal > 0 ? Math.round((discountAmount / newSubtotal) * 10000) / 100 : 0;
  const totalPrice = newSubtotal - discountAmount + Number(order.deliveryCost) + Number(order.otherCost);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.calculation.createMany({
      data: added.computed.map((c, i) => ({
        projectId: order.projectId,
        seq: startSeq + i,
        ...calcResultToCreatePayload(c.input, c.result),
      })),
    });
    const u = await tx.order.update({
      where: { id: order.id },
      data: {
        roomsSubtotal: newSubtotal,
        discountPercent: resolvedPercent,
        totalArea: Number(order.totalArea) + added.totalArea,
        totalBlocks: order.totalBlocks + added.totalBlocks,
        totalBeams: order.totalBeams + added.totalBeams,
        totalPrice,
      },
      select: { id: true, orderNumber: true, totalPrice: true },
    });
    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        type: "ORDER_EDITED",
        actorId: user.id,
        message: `Added ${rooms.length} room(s) from AI draft (+${Math.round(added.roomsSubtotal).toLocaleString("en-US")} UZS)`,
        payload: {
          draftProjectId: draft.id,
          draftNumber: draft.draftNumber,
          addedRooms: rooms.length,
          addedSubtotal: added.roomsSubtotal,
        },
      },
    });
    // Retire the merged draft — its rooms now live on the order's project.
    await tx.project.update({ where: { id: draft.id }, data: { status: "ARCHIVED" } });
    return u;
  });

  recordAudit({
    userId: user.id,
    action: "order.addRooms",
    targetType: "order",
    targetId: updated.id,
    message: `Added ${rooms.length} room(s) to ${updated.orderNumber} from draft ${draft.id}`,
    metadata: { draftProjectId: draft.id, addedSubtotal: added.roomsSubtotal },
  });

  return ok({
    orderId: updated.id,
    orderNumber: updated.orderNumber,
    addedRooms: rooms.length,
    totalPrice: Number(updated.totalPrice),
  });
});
