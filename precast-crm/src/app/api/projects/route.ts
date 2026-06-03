export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { SaveProjectDraftSchema, ProjectStatusEnum } from "@/lib/validation";
import { ok, fail, created } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { can } from "@/lib/permissions";
import { recordAudit } from "@/lib/audit";
import { calculateSlab, type Pattern } from "@/services/calculation-engine";
import { loadPricingConfig } from "@/lib/pricing-config";
import { calcResultToCreatePayload } from "@/lib/calc-persistence";
import { normalizePhone, phoneMatchForms } from "@/lib/phone";
import { addressSearchForms } from "@/lib/regions";
import { nextDraftNumber } from "@/lib/draft-number";

/** GET /api/projects — order.view. List projects with optional status + search. */
export const GET = withPermission("order.view", async (req: NextRequest, { user }) => {
  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get("dealId") ?? undefined;
  const status = searchParams.get("status") ?? undefined; // DRAFT | ORDERED | ARCHIVED
  const q = searchParams.get("q")?.trim() ?? "";

  const where: Record<string, unknown> = {};
  if (dealId) where.dealId = dealId;
  if (status && ProjectStatusEnum.options.includes(status as never)) where.status = status;

  if (q) {
    const phoneForms = phoneMatchForms(q);
    const addrForms = addressSearchForms(q);
    const filters: unknown[] = [
      { name: { contains: q, mode: "insensitive" } },
      { tentativeClientName: { contains: q, mode: "insensitive" } },
      { client: { name: { contains: q, mode: "insensitive" } } },
    ];
    for (const a of addrForms) {
      filters.push({ tentativeClientAddress: { contains: a, mode: "insensitive" } });
      filters.push({ client: { address: { contains: a, mode: "insensitive" } } });
    }
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
      calculations: { orderBy: { seq: "asc" } },
      client: true,
      orders: { select: { id: true, orderNumber: true, status: true, scheduledAt: true } },
    },
  });

  // The conversation link is inbox-only data. Strip it for users without
  // inbox.access so chat linkage never leaks through the projects surface.
  const sanitized = can(user, "inbox.access")
    ? projects
    : projects.map((p) => ({ ...p, conversationId: null }));
  return ok(sanitized);
});

/** POST /api/projects — order.create. Save Project (draft). Phone-only required. */
export const POST = withPermission("order.create", async (req: NextRequest, { user }) => {
  const body = SaveProjectDraftSchema.parse(await req.json());

  const phoneNorm = normalizePhone(body.clientPhone);
  if (!phoneNorm) return fail("phone is required to save a draft", 422);

  // Link the draft to its source Telegram chat — but only if the caller can
  // actually see the inbox. A non-inbox operator's conversationId is dropped
  // silently (the quote still saves) so chat linkage can never leak via the
  // /projects surface.
  const linkConversationId =
    can(user, "inbox.access") && body.conversationId ? body.conversationId : undefined;

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
          // Only set when a linkable conversationId is present; a plain
          // re-save (no link in the body) must not null out an existing link.
          ...(linkConversationId ? { conversationId: linkConversationId } : {}),
          clientId: existingClient?.id ?? null,
          tentativeClientName: existingClient ? null : body.clientName ?? null,
          tentativeClientPhone: existingClient ? null : phoneNorm,
          tentativeClientAddress: existingClient ? null : body.clientAddress ?? null,
          calculations: {
            create: computed.map((c, i) => ({ ...calcResultToCreatePayload(c.input, c.result), seq: i })),
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
        conversationId: linkConversationId ?? null,
        clientId: existingClient?.id ?? null,
        tentativeClientName: existingClient ? null : body.clientName ?? null,
        tentativeClientPhone: existingClient ? null : phoneNorm,
        tentativeClientAddress: existingClient ? null : body.clientAddress ?? null,
        calculations: {
          create: computed.map((c, i) => ({ ...calcResultToCreatePayload(c.input, c.result), seq: i })),
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

    // Refuse to delete any project that has an Order row pointing at it,
    // regardless of the project's own `status`. Filtering on status alone
    // isn't enough: we've seen rows in the wild where status=DRAFT but an
    // Order still exists (legacy from a partial transition path), and the
    // deleteMany then crashes on the FK constraint and surfaces to the
    // operator as "Internal server error". Checking the order side
    // directly catches every variant.
    const withOrders = await prisma.project.findMany({
      where: { id: { in: body.ids }, orders: { some: {} } },
      select: { id: true, draftNumber: true, orders: { select: { orderNumber: true }, take: 1 } },
    });
    if (withOrders.length > 0) {
      const sample = withOrders[0]?.orders[0]?.orderNumber ?? "?";
      return fail(
        `Бу лойиҳалар учун буюртма мавжуд (масалан №${sample}) — олдин буюртмани бекор қилинг · ${withOrders.length} project(s) already have orders (e.g. #${sample}) — cancel the order first`,
        409,
        { projectIds: withOrders.map((p) => p.id) },
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
