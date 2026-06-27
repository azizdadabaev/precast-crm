export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { PlaceOrderSchema } from "@/lib/validation";
import { ok, fail, created } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { can } from "@/lib/permissions";
import { createOrder } from "@/lib/create-order";
import { normalizePhone, phoneMatchForms } from "@/lib/phone";
import { addressSearchForms } from "@/lib/regions";

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
    // Bucket by the server's local timezone so the day window matches
    // the capacity calendar (which uses Date#getDate() — also local).
    // The orders list page sends `day=YYYY-MM-DD` formatted from the
    // operator's local date; resolving it as UTC midnight here would
    // skew the window by the operator's offset (e.g. a Tashkent +05
    // operator picking May 29 would miss any order whose scheduledAt
    // is between 19:00 May 28 UTC and 00:00 May 29 UTC, even though
    // that order shows in the May 29 calendar cell).
    const [y, m, d] = day.split("-").map((n) => Number(n));
    if (
      Number.isFinite(y) &&
      Number.isFinite(m) &&
      Number.isFinite(d)
    ) {
      const start = new Date(y, m - 1, d, 0, 0, 0, 0);
      const end = new Date(y, m - 1, d + 1, 0, 0, 0, 0);
      where.scheduledAt = { gte: start, lt: end };
    }
  }
  if (q) {
    const phoneForms = phoneMatchForms(q);
    // Latin↔Cyrillic widening: if the operator typed a region name in
    // one alphabet but the stored address is in the other, this folds
    // the alternate alphabet into the OR set so the row still matches.
    const addrForms = addressSearchForms(q);
    const filters: unknown[] = [
      { orderNumber: { contains: q, mode: "insensitive" } },
      { client: { name: { contains: q, mode: "insensitive" } } },
    ];
    for (const a of addrForms) {
      filters.push({ client: { address: { contains: a, mode: "insensitive" } } });
    }
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
 * POST /api/orders — order.create. Delegates to the `createOrder` service
 * (src/lib/create-order.ts) which runs the atomic placement transaction
 * (client dedup → project/calcs → order number → deal → order → events →
 * optional payment) plus the post-commit audit + notifications.
 *
 * Two checks stay here because they need the HTTP user session:
 *  - Up-front payment additionally requires payment.record. Most users with
 *    order.create also have it (SALES, OWNER, ADMIN); gated here so a CUSTOM
 *    user without payment.record can still place orders but can't book partial
 *    payments inline.
 *  - The conversationId strip below (inbox.access).
 * The early phone check preserves the original failure ordering (phone 422 is
 * reported before the payment-permission 403); createOrder re-validates phone
 * for the session-free path.
 */
export const POST = withPermission("order.create", async (req: NextRequest, { user }) => {
  const body = PlaceOrderSchema.parse(await req.json());

  if (!normalizePhone(body.clientPhone)) return fail("phone is required", 422);

  const paidAmount = body.paidAmount ?? 0;
  if (paidAmount > 0 && !can(user, "payment.record")) {
    return fail(
      "Сизга тўлов киритиш рухсати йўқ · You can't record payments — place the order with paidAmount=0 and add payment separately",
      403,
    );
  }

  const result = await createOrder(body, {
    userId: user.id,
    // Owner/admin (payment.confirm) is the confirming authority, so their
    // up-front payment at placement auto-confirms — same as POST /api/payments.
    autoConfirmPayment: can(user, "payment.confirm"),
  });
  if (!result.ok) {
    return fail(result.error.message, result.error.status, result.error.details);
  }
  const order = result.order;

  // The conversation link is inbox-only data — never expose it through the
  // orders surface to order.create users who lack inbox.access.
  if (order.project && !can(user, "inbox.access")) {
    order.project.conversationId = null;
  }
  return created(order);
});
