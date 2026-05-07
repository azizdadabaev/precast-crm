export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { PlaceOrderSchema } from "@/lib/validation";
import { ok, fail, created, handler } from "@/lib/api";
import { calculateSlab, type Pattern } from "@/services/calculation-engine";
import { calcResultToCreatePayload } from "@/lib/calc-persistence";
import { normalizePhone, phoneMatchForms } from "@/lib/phone";
import { nextOrderNumber, orderNumberMonthPrefix } from "@/lib/order-number";

/** GET /api/orders — list with optional search + status filter */
export const GET = handler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const status = searchParams.get("status") ?? undefined;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (q) {
    const phoneForms = phoneMatchForms(q);
    const filters: unknown[] = [
      { orderNumber: { contains: q, mode: "insensitive" } },
      { client: { name: { contains: q, mode: "insensitive" } } },
      { client: { address: { contains: q, mode: "insensitive" } } },
    ];
    if (phoneForms.length) {
      // any of the suffix forms appearing as a substring of the stored phone
      for (const f of phoneForms) {
        filters.push({ client: { phone: { contains: f } } });
      }
    }
    where.OR = filters;
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: [{ scheduledAt: "asc" }, { placedAt: "desc" }],
    include: {
      client: true,
      project: { select: { id: true, name: true } },
    },
  });
  return ok(orders);
});

/**
 * POST /api/orders — Place Order. Atomic transaction:
 *   1. Resolve or create the Client (dedup by normalized phone)
 *   2. Use the existing draft Project, or create a new one inline from the rooms
 *   3. Calculate every room (or reuse already-persisted Calculations)
 *   4. Allocate the next order number for the current month
 *   5. Create the Order with the pricing snapshot + scheduled date
 *   6. Create an OrderEvent (ORDER_PLACED) entry
 *   7. Mark the Project status = ORDERED, link clientId, clear tentative fields
 *   8. Advance Deal stage to WON (creating the Deal if missing)
 */
export const POST = handler(async (req: NextRequest) => {
  const body = PlaceOrderSchema.parse(await req.json());

  const phoneNorm = normalizePhone(body.clientPhone);
  if (!phoneNorm) return fail("phone is required", 422);

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
  const discountAmount = roomsSubtotal * (body.discountPercent / 100);
  const totalPrice = roomsSubtotal - discountAmount + body.deliveryCost + body.otherCost;

  // Allocate the order number AFTER we know the placement month
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
        },
      });
    } else {
      // Update name/address if they changed (operator may have a more current address)
      const updates: Record<string, string> = {};
      if (client.name !== body.clientName) updates.name = body.clientName;
      if (client.address !== body.clientAddress) updates.address = body.clientAddress;
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
      // Replace its calculations with the freshly computed ones (operator may
      // have edited rooms before pressing Place Order)
      await tx.calculation.deleteMany({ where: { projectId: project.id } });
      await tx.calculation.createMany({
        data: computed.map((c) => ({
          projectId: project!.id,
          ...calcResultToCreatePayload(c.input, c.result),
        })),
      });
    } else {
      // Inline: build the project from the request rooms in one go
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

    // Re-fetch with calculations (after createMany)
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

    // 5. Update Project — link client, mark ORDERED, attach Deal, clear tentatives
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
    const created = await tx.order.create({
      data: {
        orderNumber,
        projectId: updatedProject.id,
        clientId: client.id,
        primaryCalculationId: primaryCalc?.id ?? null,
        status: "PLACED",
        roomsSubtotal,
        discountPercent: body.discountPercent,
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
        orderId: created.id,
        type: "ORDER_PLACED",
        message: `Order placed for ${client.name}`,
        payload: {
          totalPrice,
          totalArea,
          scheduledAt: body.scheduledAt.toISOString(),
        },
      },
    });

    return created;
  });

  return created(order);
});
