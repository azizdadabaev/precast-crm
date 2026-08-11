export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
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
import { addressSearchForms, VILOYATS } from "@/lib/regions";
import { nextDraftNumber } from "@/lib/draft-number";
import { copyUploadToProject, isAllowedAnnotationSource } from "@/lib/uploads";
import {
  parseTableQuery,
  isPaginated,
  buildPageMeta,
  type SortDir,
} from "@/lib/table-query";

/**
 * Sortable columns for the saved-drafts table. Everything the browser derives
 * from `calculations` (rooms, slab length, area, weight, subtotal) is absent on
 * purpose: those totals don't exist as columns, so SQL can't order by them.
 * `client`/`address` are absent too — they display a COALESCE of a relation and
 * a tentative scalar, which a Prisma orderBy can't reproduce.
 */
const PROJECT_SORT_FIELDS = [
  "updatedAt",
  "createdAt",
  "status",
  "draftNumber",
] as const;

function projectOrderBy(
  sortBy: string | null,
  sortDir: SortDir,
): Prisma.ProjectOrderByWithRelationInput {
  switch (sortBy) {
    case "createdAt":
      return { createdAt: sortDir };
    case "status":
      return { status: sortDir };
    case "draftNumber":
      return { draftNumber: sortDir };
    default:
      return { updatedAt: sortDir };
  }
}

/** GET /api/projects — order.view. List projects with optional status + search. */
export const GET = withPermission("order.view", async (req: NextRequest, { user }) => {
  const { searchParams } = new URL(req.url);
  const dealId = searchParams.get("dealId") ?? undefined;
  const status = searchParams.get("status") ?? undefined; // DRAFT | ORDERED | ARCHIVED
  const source = searchParams.get("source") ?? undefined; // "agent" → AI-agent drafts only
  const q = searchParams.get("q")?.trim() ?? "";
  const operatorId = searchParams.get("operatorId")?.trim() ?? ""; // userId | "ai" | "none"
  const viloyat = searchParams.get("viloyat")?.trim() ?? "";

  const where: Record<string, unknown> = {};
  if (dealId) where.dealId = dealId;
  if (status && ProjectStatusEnum.options.includes(status as never)) where.status = status;
  if (source === "agent") where.aiGenerated = true;

  // Operator column filter. Two sentinels beside a real userId: "ai" for the
  // agent-authored drafts, "none" for legacy rows that have no creator.
  if (operatorId === "ai") where.aiGenerated = true;
  // "none" is handled with the real-userId case below: it must mean "the column
  // renders —", i.e. no creator AND no order-placer. Matching createdById: null
  // alone would return rows that now display the operator who placed the order.
  // A real userId is handled after the viloyat filter below: it must APPEND to
  // where.AND rather than assign it.

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

  // Region column filter. Matched against BOTH address fields (a draft's
  // address lives on the linked Client or, until Place Order, on the
  // tentative column). Nested in AND so it narrows the `q` search above
  // instead of overwriting its OR. Both alphabets are tried because the
  // address string may have been stored Latin (AddressInput) or Cyrillic
  // (free text pasted from a chat).
  if (viloyat) {
    const v = VILOYATS.find((x) => x.name === viloyat || x.nameUz === viloyat);
    const forms = v ? [v.name, v.nameUz] : [viloyat];
    where.AND = [
      {
        OR: forms.flatMap((f) => [
          { client: { address: { contains: f, mode: "insensitive" } } },
          { tentativeClientAddress: { contains: f, mode: "insensitive" } },
        ]),
      },
    ];
  }

  // Operator filter, matched against EITHER attribution the operator column can
  // display: the creator of the draft, or whoever placed the resulting order.
  // Filtering on createdById alone would hide every directly-placed order,
  // since those Projects carry no creator at all. Appended to AND so it narrows
  // the q-search OR and the viloyat clause instead of replacing either.
  if (operatorId === "none") {
    const prior = Array.isArray(where.AND) ? where.AND : [];
    where.AND = [
      ...prior,
      {
        createdById: null,
        orders: { none: { events: { some: { type: "ORDER_PLACED", actorId: { not: null } } } } },
      },
    ];
  }
  if (operatorId && operatorId !== "ai" && operatorId !== "none") {
    const prior = Array.isArray(where.AND) ? where.AND : [];
    where.AND = [
      ...prior,
      {
        OR: [
          { createdById: operatorId },
          { orders: { some: { events: { some: { type: "ORDER_PLACED", actorId: operatorId } } } } },
        ],
      },
    ];
  }

  const paginated = isPaginated(searchParams);
  const tq = parseTableQuery(searchParams, {
    allowedSortFields: PROJECT_SORT_FIELDS,
    defaultSort: "updatedAt",
    defaultDir: "desc",
  });

  // Same `where` for all three halves so `total` and the status counts can
  // never disagree with `rows`.
  const [projects, total, draftCount, orderedCount] = await prisma.$transaction([
    prisma.project.findMany({
      where,
      orderBy: projectOrderBy(tq.sortBy, tq.sortDir),
      ...(paginated ? { skip: tq.skip, take: tq.pageSize } : {}),
      include: {
        calculations: { orderBy: { seq: "asc" } },
        client: true,
        orders: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            scheduledAt: true,
            // Who actually placed the order. An order placed straight from the
            // calculator creates its Project with no creator, so this event is
            // the only surviving record of the operator behind it.
            events: {
              where: { type: "ORDER_PLACED" },
              select: { actor: { select: { name: true } } },
              orderBy: { createdAt: "asc" },
              take: 1,
            },
          },
        },
        createdBy: { select: { name: true } },
      },
    }),
    prisma.project.count({ where }),
    // Whole-result-set status split. Without these the Лойиҳа → Буюртма tracker
    // could only count the rows on the current page, which understates
    // conversion once the list is paginated. Composed with AND rather than by
    // overwriting `where.status`, so an active status filter still applies.
    prisma.project.count({
      where: { AND: [where as Prisma.ProjectWhereInput, { status: "DRAFT" }] },
    }),
    prisma.project.count({
      where: { AND: [where as Prisma.ProjectWhereInput, { status: "ORDERED" }] },
    }),
  ]);

  const statusCounts = { DRAFT: draftCount, ORDERED: orderedCount };

  // The conversation link is inbox-only data. Strip it for users without
  // inbox.access so chat linkage never leaks through the projects surface.
  const sanitized = can(user, "inbox.access")
    ? projects
    : projects.map((p) => ({ ...p, conversationId: null }));

  // BACKWARD COMPATIBILITY: callers that don't ask for a page (projects/[id],
  // the calculations page) still get the bare array they've always got.
  if (!paginated) return ok(sanitized);
  return ok({
    rows: sanitized,
    ...buildPageMeta(total, tq.page, tq.pageSize),
    statusCounts,
  });
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
  // otherwise keep it as tentativeClientPhone until Place Order.
  const existingClient = await prisma.client.findUnique({ where: { phone: phoneNorm } });

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
      const existing = await tx.project.findUnique({
        where: { id: body.projectId },
        include: { calculations: { orderBy: { seq: "asc" } } },
      });
      if (!existing) throw new Error("PROJECT_NOT_FOUND");
      if (existing.status === "ORDERED") throw new Error("PROJECT_ORDERED");

      // Snapshot the PRE-save floor plan + priced rooms into an append-only
      // DrawingVersion BEFORE the deleteMany below would destroy them — so a
      // prior quote is never silently lost on an edit.
      if (existing.drawingJson != null || existing.calculations.length > 0) {
        await tx.drawingVersion.create({
          data: {
            projectId: existing.id,
            drawingJson:
              existing.drawingJson === null
                ? Prisma.DbNull
                : (existing.drawingJson as Prisma.InputJsonValue),
            roomsJson: existing.calculations.map((c) => ({
              name: c.name,
              innerWidth: Number(c.innerWidth),
              innerLength: Number(c.innerLength),
              bearing: Number(c.bearing),
              correction: Number(c.correction),
              extraBeams: c.extraBeams,
              forceStartBeam: c.forceStartBeam,
              patternOverride: c.patternOverride,
              m2PriceOverride: c.m2PriceOverride,
              m2Price: Number(c.m2Price),
              m2PriceReason: c.m2PriceReason,
              subtotal: Number(c.subtotal),
            })) as Prisma.InputJsonValue,
            createdById: user.id,
          },
        });
      }

      await tx.calculation.deleteMany({ where: { projectId: existing.id } });
      const updated = await tx.project.update({
        where: { id: existing.id },
        data: {
          name: body.name ?? null,
          shapeType: body.shapeType,
          dimensions: dim,
          // Absent in the body → leave any existing drawing untouched; explicit
          // null → clear it; object → replace it.
          ...(body.drawing !== undefined
            ? { drawingJson: body.drawing ?? Prisma.DbNull }
            : {}),
          status: "DRAFT",
          discountPercent: body.discountPercent,
          discountAmount: body.discountAmount,
          // Only set when a linkable conversationId is present; a plain
          // re-save (no link in the body) must not null out an existing link.
          ...(linkConversationId ? { conversationId: linkConversationId } : {}),
          clientId: existingClient?.id ?? null,
          tentativeClientName: existingClient ? null : body.clientName ?? null,
          tentativeClientPhone: existingClient ? null : phoneNorm,
          tentativeClientAddress: existingClient ? null : body.clientAddress ?? null,
          // Preserve the original creator; only stamp the current operator when
          // the draft has no creator yet (legacy rows / previously null).
          ...(existing.createdById ? {} : { createdById: user.id }),
          calculations: {
            create: computed.map((c, i) => ({
              ...calcResultToCreatePayload(c.input, c.result),
              seq: i,
              annotationBox: c.input.box
                ? { x: c.input.box.x, y: c.input.box.y, w: c.input.box.w, h: c.input.box.h }
                : undefined,
            })),
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
        drawingJson: body.drawing ?? Prisma.DbNull,
        status: "DRAFT",
        discountPercent: body.discountPercent,
        discountAmount: body.discountAmount,
        conversationId: linkConversationId ?? null,
        createdById: user.id,
        clientId: existingClient?.id ?? null,
        tentativeClientName: existingClient ? null : body.clientName ?? null,
        tentativeClientPhone: existingClient ? null : phoneNorm,
        tentativeClientAddress: existingClient ? null : body.clientAddress ?? null,
        calculations: {
          create: computed.map((c, i) => ({
            ...calcResultToCreatePayload(c.input, c.result),
            seq: i,
            annotationBox: c.input.box
              ? { x: c.input.box.x, y: c.input.box.y, w: c.input.box.w, h: c.input.box.h }
              : undefined,
          })),
        },
      },
      include: { calculations: true, client: true },
    });
  });

  // Copy annotated drawings into a project-owned folder so the visual record
  // survives deletion of the source chat, and stamp annotationImagePath onto
  // each annotated room. Runs outside the tx (fs isn't transactional); a
  // failed copy leaves the box coords intact, just without the image.
  // A box may only reference this project's own media, the linked chat's
  // folder, or the requesting operator's own draft uploads — never another
  // conversation's media, another operator's drafts, or arbitrary/`..` paths.
  // This closes an authz gap: box.imagePath is client-supplied.
  const copyCache = new Map<string, string | null>();
  for (const calc of project.calculations) {
    const src = computed[calc.seq]?.input.box?.imagePath;
    if (!src) continue;
    if (
      !isAllowedAnnotationSource(src, {
        projectId: project.id,
        conversationId: linkConversationId ?? null,
        userId: user.id,
      })
    ) {
      continue; // outside the project's own media / its linked chat / the operator's drafts — ignore
    }
    let dest = copyCache.get(src);
    if (dest === undefined) {
      dest = await copyUploadToProject(project.id, src).catch(() => null);
      copyCache.set(src, dest);
    }
    if (dest) {
      await prisma.calculation.update({
        where: { id: calc.id },
        data: { annotationImagePath: dest },
      });
    }
  }

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
