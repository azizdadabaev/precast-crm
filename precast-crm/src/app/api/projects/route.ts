export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { SaveProjectDraftSchema, ProjectStatusEnum } from "@/lib/validation";
import { ok, fail, created } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { calculateSlab, type Pattern } from "@/services/calculation-engine";
import { calcResultToCreatePayload } from "@/lib/calc-persistence";
import { normalizePhone, phoneMatchForms } from "@/lib/phone";
import { nextDraftNumber } from "@/lib/draft-number";

/** GET /api/projects — order.view. List projects with optional status + search. */
export const GET = withPermission("order.view", async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get("dealId") ?? undefined;
  const status = searchParams.get("status") ?? undefined; // DRAFT | ORDERED | ARCHIVED
  const q = searchParams.get("q")?.trim() ?? "";

  const where: Record<string, unknown> = {};
  if (dealId) where.dealId = dealId;
  if (status && ProjectStatusEnum.options.includes(status as never)) where.status = status;

  if (q) {
    const phoneForms = phoneMatchForms(q);
    const filters: unknown[] = [
      { name: { contains: q, mode: "insensitive" } },
      { tentativeClientName: { contains: q, mode: "insensitive" } },
      { tentativeClientAddress: { contains: q, mode: "insensitive" } },
      { client: { name: { contains: q, mode: "insensitive" } } },
      { client: { address: { contains: q, mode: "insensitive" } } },
    ];
    for (const f of phoneForms) {
      filters.push({ tentativeClientPhone: { contains: f } });
      filters.push({ client: { phone: { contains: f } } });
    }
    where.OR = filters;
  }

  const projects = await prisma.project.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      calculations: { orderBy: { createdAt: "asc" } },
      client: true,
      orders: { select: { id: true, orderNumber: true, status: true, scheduledAt: true } },
    },
  });
  return ok(projects);
});

/** POST /api/projects — order.create. Save Project (draft). Phone-only required. */
export const POST = withPermission("order.create", async (req: NextRequest, { user }) => {
  const body = SaveProjectDraftSchema.parse(await req.json());

  const phoneNorm = normalizePhone(body.clientPhone);
  if (!phoneNorm) return fail("phone is required to save a draft", 422);

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

  // If the phone matches an existing Client, attach to the Client up front;
  // otherwise keep it as tentativeClientPhone until Place Order. We also
  // capture consent here when the operator ticked the call-time checkbox
  // and the matched client doesn't already have GRANTED.
  const existingClient = await prisma.client.findUnique({ where: { phone: phoneNorm } });
  if (
    existingClient &&
    body.clientReferenceConsent &&
    body.clientReferenceConsent !== existingClient.referenceConsent
  ) {
    await prisma.client.update({
      where: { id: existingClient.id },
      data: {
        referenceConsent: body.clientReferenceConsent,
        consentUpdatedAt: new Date(),
      },
    });
  }

  // Resolve dimensions snapshot
  const dim =
    body.dimensions ??
    (body.rooms.length > 0
      ? {
          width: body.rooms[0].innerWidth,
          length: body.rooms[0].innerLength,
          notes: `${body.rooms.length} room${body.rooms.length === 1 ? "" : "s"}`,
        }
      : { width: 0, length: 0 });

  const project = await prisma.$transaction(async (tx) => {
    if (body.projectId) {
      // Update existing draft
      const existing = await tx.project.findUnique({ where: { id: body.projectId } });
      if (!existing) throw new Error("PROJECT_NOT_FOUND");
      if (existing.status === "ORDERED") throw new Error("PROJECT_ORDERED");

      await tx.calculation.deleteMany({ where: { projectId: existing.id } });
      const updated = await tx.project.update({
        where: { id: existing.id },
        data: {
          name: body.name ?? null,
          shapeType: body.shapeType,
          dimensions: dim,
          status: "DRAFT",
          clientId: existingClient?.id ?? null,
          tentativeClientName: existingClient ? null : body.clientName ?? null,
          tentativeClientPhone: existingClient ? null : phoneNorm,
          tentativeClientAddress: existingClient ? null : body.clientAddress ?? null,
          calculations: {
            create: computed.map((c) => calcResultToCreatePayload(c.input, c.result)),
          },
        },
        include: { calculations: true, client: true },
      });
      return updated;
    }

    // Allocate the next draft number atomically (within this tx).
    // The @unique constraint on draftNumber catches the rare race;
    // for this CRM's volume an inline max+1 is plenty.
    const maxAgg = await tx.project.aggregate({
      _max: { draftNumber: true },
    });
    const draftNumber = nextDraftNumber(maxAgg._max.draftNumber ?? null);

    return tx.project.create({
      data: {
        name: body.name ?? null,
        draftNumber,
        shapeType: body.shapeType,
        dimensions: dim,
        status: "DRAFT",
        clientId: existingClient?.id ?? null,
        tentativeClientName: existingClient ? null : body.clientName ?? null,
        tentativeClientPhone: existingClient ? null : phoneNorm,
        tentativeClientAddress: existingClient ? null : body.clientAddress ?? null,
        calculations: {
          create: computed.map((c) => calcResultToCreatePayload(c.input, c.result)),
        },
      },
      include: { calculations: true, client: true },
    });
  });

  recordAudit({
    userId: user.id,
    action: body.projectId ? "project.update" : "project.create",
    targetType: "project",
    targetId: project.id,
    message: project.name ?? `Draft #${project.draftNumber ?? ""}`.trim(),
    metadata: { roomCount: project.calculations.length },
  });

  return created(project);
});

/**
 * DELETE /api/projects — owner-only bulk delete of saved drafts.
 *
 * Body: { ids: string[] }
 *
 * Rules:
 *   - Only DRAFT projects can be deleted. ORDERED rows are refused so an
 *     order-placed project (and its order/payment trail) is never orphaned.
 *   - The delete is transactional and cascades to Calculations via Prisma's
 *     onDelete: Cascade (defined on the FK).
 *   - DrawingRequests with projectId set will have their FK nulled
 *     (onDelete: SET NULL) so their history survives the project deletion.
 */
const DeleteBody = z.object({
  ids: z.array(z.string()).min(1).max(200),
});

export const DELETE = withPermission(
  "project.delete",
  async (req: NextRequest, { user }) => {
    const body = DeleteBody.parse(await req.json());

    const ordered = await prisma.project.findMany({
      where: { id: { in: body.ids }, status: "ORDERED" },
      select: { id: true, name: true, draftNumber: true },
    });
    if (ordered.length > 0) {
      return fail(
        `Cannot delete ${ordered.length} project(s) that already have orders. Cancel the order first.`,
        409,
      );
    }

    const result = await prisma.project.deleteMany({
      where: { id: { in: body.ids }, status: "DRAFT" },
    });

    recordAudit({
      userId: user.id,
      action: "project.delete",
      targetType: "project",
      message: `Deleted ${result.count} draft project(s)`,
      metadata: { ids: body.ids, deletedCount: result.count },
    });

    return ok({ deleted: result.count });
  },
);
