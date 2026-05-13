export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { PlaceOrderSchema } from "@/lib/validation";
import { ok, fail, created } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { can } from "@/lib/permissions";
import { calculateSlab, type Pattern } from "@/services/calculation-engine";
import { calcResultToCreatePayload } from "@/lib/calc-persistence";
import { normalizePhone, phoneMatchForms } from "@/lib/phone";
import { nextOrderNumber, orderNumberMonthPrefix } from "@/lib/order-number";

/** GET /api/orders — order.view. Paginated. Search/status/day filters
 * run server-side so `q` matches the full DB even when only one page
 * of rows is rendered. Response: { items, total, page, pageSize, totalPages }. */
export const GET = withPermission("order.view", async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const status = searchParams.get("status") ?? undefined;
  const day = searchParams.get("day") ?? undefined;

  const pageRaw = Number(searchParams.get("page") ?? "1");
  const sizeRaw = Number(searchParams.get("pageSize") ?? "20");
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const pageSize = Number.isFinite(sizeRaw)
    ? Math.min(100, Math.max(1, Math.floor(sizeRaw)))
    : 20;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const start = new Date(`${day}T00:00:00.000Z`);
    if (!Number.isNaN(start.getTime())) {
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      where.scheduledAt = { gte: start, lt: end };
    }
  }
  if (q) {
    const phoneForms = phoneMatchForms(q);
    const filters: unknown[] = [
      { orderNumber: { contains: q, mode: "insensitive" } },
      { client: { name: { contains: q, mode: "insensitive" } } },
      { client: { address: { contains: q, mode: "insensitive" } } },
    ];
    if (phoneForms.length) {
      for (const f of phoneForms) {
        filters.push({ client: { phone: { contains: f } } });
      }
    }
    where.OR = filters;
  }

  const [total, items] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: [{ scheduledAt: "asc" }, { placedAt: "desc" }],
      include: {
        client: true,
        project: { select: { id: true, name: true } },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return ok({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

/**
 * POST /api/orders — order.create. Atomic transaction:
 *   1. Resolve or create the Client (dedup by normalized phone)
 *   2. Use the existing draft Project, or create a new one inline from the rooms
 *   3. Calculate every room (or reuse already-persisted Calculations)
 *   4. Allocate the next order number for the current month
 *   5. Create the Order with the pricing snapshot + scheduled date
 *   6. Create an OrderEvent (ORDER_PLACED) entry
 *   7. Mark the Project status = ORDERED, link clientId, clear tentative fields
 *   8. Advance Deal stage to WON (creating the Deal if missing)
 *   9. Optional up-front payment row (PENDING_CONFIRMATION)
 *
 * Up-front payment additionally requires payment.record. Most users
 * with order.create also have payment.record (SALES, OWNER, ADMIN);
 * gated here so a CUSTOM user without payment.record can still
 * place orders but can't book partial payments inline.
 */
export const POST = withPermission("order.create", async (req: NextRequest, { user }) => {
  const body = PlaceOrderSchema.parse(await req.json());

  const phoneNorm = normalizePhone(body.clientPhone);
  if (!phoneNorm) return fail("phone is required", 422);

  const paidAmount = body.paidAmount ?? 0;
  if (paidAmount > 0 && !can(user, "payment.record")) {
    return fail(
      "Сизга тўлов киритиш рухсати йўқ · You can't record payments — place the order with paidAmount=0 and add payment separately",
      403,
    );
  }

  // Compute every room up-front so we have totals for the snapshot
  const computed = body.rooms.map((room) => ({
    input: room,
    result: calculateSlab({
      inner_width: room.innerWidth,
      inner_length: room.innerLength,
      bearing: room.bearing,
      correction: room.correction,
      extra_beams: room.extraBeams,
      force_start_beam: room.forceStartBeam,
      pattern: (room.patternOverride ?? undefined) as Pattern | undefined,
    }),
  }));

  const roomsSubtotal = computed.reduce((s, c) => s + c.result.subtotal, 0);
  const totalArea = computed.reduce((s, c) => s + c.result.monolith_area, 0);
  const totalBlocks = computed.reduce((s, c) => s + c.result.total_blocks, 0);
  const totalBeams = computed.reduce((s, c) => s + c.result.beam_count, 0);
  // Discount has two modes: exact UZS amount OR percentage. The
  // client UI gates them mutually exclusive but the server resolves
  // by precedence (amount > 0 wins) — safe even if a buggy client
  // sends both. Amount is capped at the subtotal so a typo can't
  // produce a negative total. The persisted discountPercent is
  // back-computed from the amount for downstream consistency.
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
  const totalPrice =
    roomsSubtotal - discountAmount + body.deliveryCost + body.otherCost;

  if (paidAmount > totalPrice) {
    return fail(
      `paidAmount (${paidAmount}) cannot exceed totalPrice (${totalPrice})`,
      422,
    );
  }

  const placedAt = new Date();
  const year = placedAt.getFullYear();
  const month = placedAt.getMonth() + 1;
  const monthPrefix = orderNumberMonthPrefix(year, month);

  const order = await prisma.$transaction(async (tx) => {
    // 1. Resolve or create Client
    let client = await tx.client.findUnique({ where: { phone: phoneNorm } });
    if (!client) {
      client = await tx.client.create({
        data: {
          name: body.clientName,
          phone: phoneNorm,
          address: body.clientAddress,
          ...(body.clientReferenceConsent
            ? {
                referenceConsent: body.clientReferenceConsent,
                consentUpdatedAt: new Date(),
              }
            : {}),
        },
      });
    } else {
      const updates: Record<string, unknown> = {};
      if (client.name !== body.clientName) updates.name = body.clientName;
      if (client.address !== body.clientAddress) updates.address = body.clientAddress;
      if (
        body.clientReferenceConsent &&
        body.clientReferenceConsent !== client.referenceConsent
      ) {
        updates.referenceConsent = body.clientReferenceConsent;
        updates.consentUpdatedAt = new Date();
      }
      if (Object.keys(updates).length) {
        client = await tx.client.update({ where: { id: client.id }, data: updates });
      }
    }

    // 2. Resolve or create Project + its Calculations
    let project;
    if (body.projectId) {
      project = await tx.project.findUnique({
        where: { id: body.projectId },
        include: { calculations: true },
      });
      if (!project) throw new Error("PROJECT_NOT_FOUND");
      await tx.calculation.deleteMany({ where: { projectId: project.id } });
      await tx.calculation.createMany({
        data: computed.map((c) => ({
          projectId: project!.id,
          ...calcResultToCreatePayload(c.input, c.result),
        })),
      });
    } else {
      project = await tx.project.create({
        data: {
          clientId: client.id,
          name: null,
          shapeType: body.shapeType,
          dimensions: body.dimensions ?? {
            width: body.rooms[0].innerWidth,
            length: body.rooms[0].innerLength,
            notes: `${body.rooms.length} rooms`,
          },
          calculations: {
            create: computed.map((c) =>
              calcResultToCreatePayload(c.input, c.result),
            ),
          },
        },
        include: { calculations: true },
      });
    }

    const projectWithCalcs = await tx.project.findUniqueOrThrow({
      where: { id: project.id },
      include: { calculations: { orderBy: { createdAt: "asc" } } },
    });

    // 3. Allocate the next order number for this month
    const highest = await tx.order.findFirst({
      where: { orderNumber: { startsWith: monthPrefix } },
      orderBy: { orderNumber: "desc" },
      select: { orderNumber: true },
    });
    const orderNumber = nextOrderNumber(year, month, highest?.orderNumber ?? null);

    // 4. Find/create Deal for this client + advance to WON
    let deal = await tx.deal.findFirst({
      where: { clientId: client.id, status: "OPEN" },
      orderBy: { createdAt: "desc" },
    });
    if (!deal) {
      deal = await tx.deal.create({
        data: { clientId: client.id, stage: "WON", status: "WON", value: totalPrice },
      });
    } else {
      deal = await tx.deal.update({
        where: { id: deal.id },
        data: { stage: "WON", status: "WON", value: totalPrice },
      });
    }

    // 5. Update Project
    const updatedProject = await tx.project.update({
      where: { id: projectWithCalcs.id },
      data: {
        status: "ORDERED",
        clientId: client.id,
        dealId: deal.id,
        tentativeClientName: null,
        tentativeClientPhone: null,
        tentativeClientAddress: null,
      },
    });

    // 6. Create the Order
    const primaryCalc = projectWithCalcs.calculations[0];
    const createdOrder = await tx.order.create({
      data: {
        orderNumber,
        projectId: updatedProject.id,
        clientId: client.id,
        primaryCalculationId: primaryCalc?.id ?? null,
        status: "PLACED",
        roomsSubtotal,
        discountPercent: resolvedDiscountPercent,
        discountAmount,
        deliveryCost: body.deliveryCost,
        otherCost: body.otherCost,
        totalPrice,
        totalArea,
        totalBlocks,
        totalBeams,
        scheduledAt: body.scheduledAt,
        placedAt,
        notes: body.notes ?? null,
      },
      include: {
        client: true,
        project: true,
      },
    });

    // 7. Activity log
    await tx.orderEvent.create({
      data: {
        orderId: createdOrder.id,
        type: "ORDER_PLACED",
        actorId: user.id,
        message: `Order placed for ${client.name}`,
        payload: {
          totalPrice,
          totalArea,
          scheduledAt: body.scheduledAt.toISOString(),
        },
      },
    });

    // 8. Up-front payment, if any.
    if (paidAmount > 0 && body.paymentMethod) {
      const payment = await tx.payment.create({
        data: {
          orderId: createdOrder.id,
          amount: paidAmount,
          method: body.paymentMethod,
          status: "PENDING_CONFIRMATION",
          recordedById: user.id,
          recordedAt: new Date(),
          collectedById: null,
          collectedAt: null,
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: createdOrder.id,
          type: "PAYMENT_RECORDED",
          actorId: user.id,
          message: `Payment of ${paidAmount} recorded at placement (${body.paymentMethod}). Awaiting confirmation.`,
          payload: {
            paymentId: payment.id,
            amount: paidAmount,
            method: body.paymentMethod,
            recordedAtPlacement: true,
          },
        },
      });
    }

    return createdOrder;
  });

  return created(order);
});
