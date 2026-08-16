export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { Prisma, type Order } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { EditOrderSchema } from "@/lib/validation";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/phone";
import {
  resolvePhoneChange,
  type PhoneChangeDecision,
  type PhoneOwner,
} from "@/lib/client-phone-resolve";
import { calculateSlab, type Pattern } from "@/services/calculation-engine";
import { loadPricingConfig } from "@/lib/pricing-config";
import { calcResultToCreatePayload } from "@/lib/calc-persistence";

/**
 * PATCH /api/orders/[id]/edit  (order.edit)
 *
 * Replaces a placed order's calculation snapshot + pricing knobs.
 * Mirrors the Place Order POST handler's engine flow but skips the
 * client/deal/order-number bootstrap (those are fixed for an
 * existing order).
 *
 * Status policy (per the operator decision recorded in HANDOFF.md):
 *   - PLACED, IN_PRODUCTION : edit allowed
 *   - DISPATCHED, DELIVERED, CANCELED : forbidden
 *
 * Payment policy: existing Payment rows are PRESERVED. The route
 * recomputes `confirmedPaid` from the still-CONFIRMED payments and
 * sets `paymentState` accordingly against the new `totalPrice`. If
 * the new total is below `confirmedPaid`, the order ends up
 * FULLY_PAID with confirmedPaid > totalPrice (overpayment) — owners
 * resolve refunds out-of-band; this route never auto-rejects or
 * auto-refunds. If the new total is above, the existing pending
 * payments stay PENDING; the maker-checker flow handles confirm.
 *
 * Client contact: name/address/phone corrections are applied to the
 * shared Client row. The phone is the client's unique identity, so a
 * phone edit is ambiguous and may answer 409 with a machine-readable
 * `details.code` (PHONE_BELONGS_TO_OTHER / SHARED_CLIENT_PHONE) that
 * the UI re-submits with `confirmClientPhoneChange: true`. See
 * `src/lib/client-phone-resolve.ts` for the decision table.
 *
 * Audit: appends an ORDER_EDITED event with a JSON diff of the
 * pricing-snapshot fields so the Activity log shows the change
 * alongside placement, dispatch, etc. Phone corrections and
 * re-points each append their own NOTE_ADDED event with before/after.
 */
/**
 * Shown both by the pre-flight ownership check and by the P2002 race
 * fallback, so the operator sees one message for one situation.
 */
const PHONE_TAKEN_MESSAGE =
  "Бу рақам бошқа мижозга тегишли · This phone belongs to another client";

export const PATCH = withPermission<{ id: string }>(
  "order.edit",
  async (req: NextRequest, { user, params }) => {
    const body = EditOrderSchema.parse(await req.json());

    const orderId = params.id;
    const existing = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        project: { include: { calculations: true } },
        payments: { select: { status: true, amount: true } },
        client: { select: { id: true, name: true, address: true, phone: true } },
      },
    });
    if (!existing) return fail("Order not found", 404);
    if (existing.status === "DISPATCHED" || existing.status === "DELIVERED" || existing.status === "CANCELED") {
      return fail(
        `Order in status ${existing.status} cannot be edited. Use Cancel + recreate instead.`,
        422,
      );
    }

    // ── Client phone correction ─────────────────────────────────
    // The owner mistypes a number when placing an order and must be able to
    // fix it here. Resolve what the typed number MEANS before anything is
    // written, so an ambiguous case can answer 409 without half-applying the
    // edit. The actual writes happen inside the transaction below.
    let phoneDecision: PhoneChangeDecision = { action: "none" };
    let phoneOwner: PhoneOwner | null = null;
    if (existing.client && body.clientPhone !== undefined) {
      const typed = normalizePhone(body.clientPhone);
      if (!typed) {
        return fail(
          "Телефон рақами нотўғри — рақамларни киритинг · Invalid phone number — digits required",
          400,
        );
      }
      if (typed !== normalizePhone(existing.client.phone)) {
        const clientId = existing.client.id;
        const [owner, currentClientOrderCount] = await Promise.all([
          prisma.client.findFirst({
            where: { phone: typed, id: { not: clientId } },
            select: { id: true, name: true, _count: { select: { orders: true } } },
          }),
          prisma.order.count({ where: { clientId } }),
        ]);
        phoneOwner = owner
          ? { id: owner.id, name: owner.name, orderCount: owner._count.orders }
          : null;
        phoneDecision = resolvePhoneChange({
          currentPhone: existing.client.phone,
          currentClientName: existing.client.name,
          newPhone: body.clientPhone,
          currentClientOrderCount,
          otherClientWithPhone: phoneOwner,
          confirmed: body.confirmClientPhoneChange,
        });
      }
    }
    if (phoneDecision.action === "confirm-required") {
      return phoneDecision.code === "PHONE_BELONGS_TO_OTHER"
        ? fail(PHONE_TAKEN_MESSAGE, 409, {
            code: phoneDecision.code,
            targetClientId: phoneDecision.targetClientId,
            targetClientName: phoneDecision.targetClientName,
            targetClientOrderCount: phoneDecision.targetClientOrderCount,
          })
        : fail(
            "Бу мижознинг бошқа буюртмалари ҳам бор — рақам ҳаммасида ўзгаради · This client has other orders — the number will change on all of them",
            409,
            {
              code: phoneDecision.code,
              clientName: phoneDecision.clientName,
              orderCount: phoneDecision.orderCount,
            },
          );
    }

    // Compute every room up-front (mirrors POST /api/orders).
    // Edits re-price against the CURRENT pricing config — the user
    // chose to edit the order, so the new totals reflect the latest
    // tier table. The pre-edit snapshot stays in the Activity log
    // via the ORDER_EDITED event payload below.
    const pricing = await loadPricingConfig();
    const computed = body.rooms.map((room) => ({
      input: room,
      result: calculateSlab(
        {
          inner_width: room.innerWidth,
          inner_length: room.innerLength,
          bearing: room.bearing,
          correction: room.correction,
          extra_beams: room.extraBeams,
          force_start_beam: room.forceStartBeam,
          pattern: (room.patternOverride ?? undefined) as Pattern | undefined,
        },
        pricing,
      ),
    }));

    const roomsSubtotal = computed.reduce(
      (s, c) => s + Number(calcResultToCreatePayload(c.input, c.result).subtotal),
      0,
    );
    const totalArea = computed.reduce((s, c) => s + c.result.monolith_area, 0);
    const totalBlocks = computed.reduce((s, c) => s + c.result.total_blocks, 0);
    const totalBeams = computed.reduce((s, c) => s + c.result.beam_count, 0);
    // Same precedence rule as POST /api/orders: explicit amount wins
    // over percent. Amount capped at subtotal.
    let discountAmount: number;
    let resolvedDiscountPercent: number;
    if (body.discountAmount > 0) {
      discountAmount = Math.min(body.discountAmount, roomsSubtotal);
      resolvedDiscountPercent =
        roomsSubtotal > 0
          ? Math.round((discountAmount / roomsSubtotal) * 10000) / 100
          : 0;
    } else {
      resolvedDiscountPercent = body.discountPercent;
      discountAmount = roomsSubtotal * (resolvedDiscountPercent / 100);
    }
    const discountMode: "AMOUNT" | "PERCENT" = body.discountAmount > 0 ? "AMOUNT" : "PERCENT";
    const newTotal = roomsSubtotal - discountAmount + body.deliveryCost + body.otherCost;

    // Recompute confirmedPaid + paymentState against the new total.
    // Authoritative aggregation from the existing payments table —
    // never trust a stale denormalized field.
    const confirmedPaid = existing.payments
      .filter((p) => p.status === "CONFIRMED")
      .reduce((s, p) => s + Number(p.amount), 0);
    const writeOff = Number(existing.writeOffAmount);
    const newPaymentState =
      confirmedPaid + writeOff >= newTotal && newTotal > 0
        ? "FULLY_PAID"
        : confirmedPaid > 0
          ? "PARTIALLY_PAID"
          : "AWAITING_PAYMENT";

    // Pricing-snapshot diff for the audit event. Decimal columns come
    // back as strings via Prisma; cast through Number for the diff so
    // the JSON in the OrderEvent reads cleanly.
    const oldSnapshot = {
      roomsSubtotal: Number(existing.roomsSubtotal),
      discountPercent: Number(existing.discountPercent),
      discountAmount: Number(existing.discountAmount),
      deliveryCost: Number(existing.deliveryCost),
      otherCost: Number(existing.otherCost),
      totalPrice: Number(existing.totalPrice),
      totalArea: Number(existing.totalArea),
      totalBlocks: existing.totalBlocks,
      totalBeams: existing.totalBeams,
      scheduledAt: existing.scheduledAt.toISOString(),
      roomsCount: existing.project.calculations.length,
    };
    const newSnapshot = {
      roomsSubtotal,
      discountPercent: resolvedDiscountPercent,
      discountAmount,
      discountMode,
      deliveryCost: body.deliveryCost,
      otherCost: body.otherCost,
      totalPrice: newTotal,
      totalArea,
      totalBlocks,
      totalBeams,
      scheduledAt: body.scheduledAt.toISOString(),
      roomsCount: computed.length,
    };

    const editTx = prisma.$transaction(async (tx) => {
      // Replace the project's calculations with the freshly-computed ones.
      await tx.calculation.deleteMany({ where: { projectId: existing.projectId } });
      await tx.calculation.createMany({
        data: computed.map((c, i) => ({
          projectId: existing.projectId,
          seq: i,
          ...calcResultToCreatePayload(c.input, c.result),
        })),
      });
      const refreshed = await tx.project.findUniqueOrThrow({
        where: { id: existing.projectId },
        include: { calculations: { orderBy: { seq: "asc" } } },
      });
      const primaryCalc = refreshed.calculations[0];

      let o = await tx.order.update({
        where: { id: existing.id },
        data: {
          roomsSubtotal,
          discountPercent: resolvedDiscountPercent,
          discountAmount,
          discountMode,
          deliveryCost: body.deliveryCost,
          otherCost: body.otherCost,
          totalPrice: newTotal,
          totalArea,
          totalBlocks,
          totalBeams,
          scheduledAt: body.scheduledAt,
          notes: body.notes ?? null,
          primaryCalculationId: primaryCalc?.id ?? null,
          // Recompute the denormalized aggregate + state. paidAt only
          // flips upward — never clear it because of an edit.
          confirmedPaid,
          paymentState: newPaymentState,
          ...(existing.paidAt === null && newPaymentState === "FULLY_PAID"
            ? { paidAt: new Date() }
            : {}),
        },
      });

      // Surface the price-composition adjustments in the log message so a
      // discount (or delivery/other) that moved the total is legible at a
      // glance — the full before/after breakdown remains in `payload`.
      const priceParts: string[] = [];
      if (discountAmount > 0) priceParts.push(`discount ${discountAmount.toFixed(0)}`);
      if (body.deliveryCost > 0) priceParts.push(`delivery ${body.deliveryCost.toFixed(0)}`);
      if (body.otherCost > 0) priceParts.push(`other ${body.otherCost.toFixed(0)}`);

      await tx.orderEvent.create({
        data: {
          orderId: existing.id,
          type: "ORDER_EDITED",
          actorId: user.id,
          message: `Order edited: total ${oldSnapshot.totalPrice.toFixed(0)} → ${newTotal.toFixed(0)} (${computed.length} rooms)${priceParts.length ? ` · ${priceParts.join(", ")}` : ""}`,
          payload: {
            before: oldSnapshot,
            after: newSnapshot,
          },
        },
      });

      // Date change earns its own event for symmetry with the regular
      // PATCH path that also stamps SCHEDULED_DATE_CHANGED. Helps the
      // Activity log read consistently.
      if (existing.scheduledAt.getTime() !== body.scheduledAt.getTime()) {
        await tx.orderEvent.create({
          data: {
            orderId: existing.id,
            type: "SCHEDULED_DATE_CHANGED",
            actorId: user.id,
            message: `Schedule moved: ${existing.scheduledAt.toISOString()} → ${body.scheduledAt.toISOString()}`,
            payload: {
              from: existing.scheduledAt.toISOString(),
              to: body.scheduledAt.toISOString(),
            },
          },
        });
      }

      // Persist any client-contact correction (address/name) to the SHARED
      // Client row — this is what a placed order displays (order.client.address),
      // and it reflects on the Clients tab + every other order for this client.
      // Skipped on a re-point: the order is moving to a client who already has
      // their own name/address, and the client being left behind is no longer
      // the record the operator is acting on.
      if (existing.client && phoneDecision.action !== "repoint") {
        const clientData: { name?: string; address?: string | null } = {};
        const newName = body.clientName?.trim();
        if (newName && newName !== existing.client.name) clientData.name = newName;
        if (body.clientAddress !== undefined) {
          const newAddr = body.clientAddress?.trim() ? body.clientAddress.trim() : null;
          if (newAddr !== existing.client.address) clientData.address = newAddr;
        }
        if (Object.keys(clientData).length) {
          await tx.client.update({ where: { id: existing.client.id }, data: clientData });
          await tx.orderEvent.create({
            data: {
              orderId: existing.id,
              type: "NOTE_ADDED",
              actorId: user.id,
              message:
                "Client contact corrected" +
                (clientData.name ? ` · name → ${clientData.name}` : "") +
                (clientData.address !== undefined ? ` · address → ${clientData.address ?? "—"}` : ""),
              payload: {
                before: { name: existing.client.name, address: existing.client.address },
                after: { ...existing.client, ...clientData },
              },
            },
          });
        }
      }

      // Phone correction. Scoped to this order's client (or to this order's
      // clientId on a re-point) and always logged — the phone is the identity
      // every other lookup path keys on.
      if (existing.client && phoneDecision.action === "update-phone") {
        await tx.client.update({
          where: { id: existing.client.id },
          data: { phone: phoneDecision.phone },
        });
        await tx.orderEvent.create({
          data: {
            orderId: existing.id,
            type: "NOTE_ADDED",
            actorId: user.id,
            message: `Client phone corrected · ${existing.client.phone || "—"} → ${phoneDecision.phone}`,
            payload: {
              change: "CLIENT_PHONE_CORRECTED",
              clientId: existing.client.id,
              clientName: existing.client.name,
              confirmed: body.confirmClientPhoneChange,
              before: { phone: existing.client.phone },
              after: { phone: phoneDecision.phone },
            },
          },
        });
      }

      // Re-point: the number turned out to belong to a different client, so
      // the order was filed under the wrong one. Move the order; never rewrite
      // either client's phone.
      if (existing.client && phoneDecision.action === "repoint") {
        o = await tx.order.update({
          where: { id: existing.id },
          data: { clientId: phoneDecision.clientId },
        });
        await tx.orderEvent.create({
          data: {
            orderId: existing.id,
            type: "NOTE_ADDED",
            actorId: user.id,
            message: `Order re-pointed to the client owning ${phoneDecision.phone} · ${existing.client.name} → ${phoneOwner?.name ?? phoneDecision.clientId}`,
            payload: {
              change: "ORDER_CLIENT_REPOINTED",
              phone: phoneDecision.phone,
              before: {
                clientId: existing.client.id,
                clientName: existing.client.name,
                phone: existing.client.phone,
              },
              after: {
                clientId: phoneDecision.clientId,
                clientName: phoneOwner?.name ?? null,
                phone: phoneDecision.phone,
              },
            },
          },
        });
      }

      return o;
    });

    let updated: Order;
    try {
      updated = await editTx;
    } catch (err) {
      // Race: the pre-flight saw the number as free, but another request
      // claimed it before our write landed. Answer with the same prompt the
      // pre-flight would have produced instead of a 500.
      const target = (
        err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002"
          ? ((err.meta?.target as string[] | string | undefined) ?? "")
          : ""
      ).toString();
      if (phoneDecision.action === "update-phone" && target.includes("phone")) {
        const winner = await prisma.client.findFirst({
          where: { phone: phoneDecision.phone },
          select: { id: true, name: true, _count: { select: { orders: true } } },
        });
        if (winner) {
          return fail(PHONE_TAKEN_MESSAGE, 409, {
            code: "PHONE_BELONGS_TO_OTHER",
            targetClientId: winner.id,
            targetClientName: winner.name,
            targetClientOrderCount: winner._count.orders,
          });
        }
      }
      throw err;
    }

    recordAudit({
      userId: user.id,
      action: "order.edit",
      targetType: "order",
      targetId: existing.id,
      message: `Edited ${existing.orderNumber}`,
      metadata: {
        orderNumber: existing.orderNumber,
        previousTotal: existing.totalPrice,
        nextTotal: updated.totalPrice,
        previousScheduledAt: existing.scheduledAt,
        nextScheduledAt: updated.scheduledAt,
        roomCount: body.rooms.length,
        clientPhoneAction: phoneDecision.action,
      },
    });

    return ok(updated);
  },
);
