export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ClientCreateSchema } from "@/lib/validation";
import { ok, created, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { normalizePhone, phoneMatchForms } from "@/lib/phone";
import { addressSearchForms, VILOYATS } from "@/lib/regions";
import {
  buildPageMeta,
  isPaginated,
  parseTableQuery,
  type SortDir,
} from "@/lib/table-query";
import { attachTotals, orderByIds, sortByTotal } from "@/lib/client-totals";

/** Columns the clients table may be ordered by. Never trust a raw sortBy. */
const CLIENT_SORT_FIELDS = [
  "name",
  "address",
  "language",
  "source",
  "createdAt",
  "orders",
  "totalBooked",
] as const;

/** Whitelisted sortBy → Prisma orderBy. `orders` is a relation aggregate. */
function clientOrderBy(
  sortBy: string | null,
  sortDir: SortDir,
): Prisma.ClientOrderByWithRelationInput {
  switch (sortBy) {
    case "name":
      return { name: sortDir };
    case "address":
      return { address: sortDir };
    case "language":
      return { language: sortDir };
    case "source":
      return { source: sortDir };
    case "orders":
      return { orders: { _count: sortDir } };
    default:
      return { createdAt: sortDir };
  }
}

/**
 * GET /api/clients
 *   ?q=...      free-text search across name, address, and trailing phone digits
 *   ?phone=...  exact-or-prefix match on the normalized phone — used by the
 *               calculator's autocomplete to dedup
 *   ?language=  filter UZ/RU
 *   ?source=    exact match on the acquisition source
 *   ?viloyat=   region filter — substring match on the stored address
 *   ?page=&pageSize=&sortBy=&sortDir=  table paging/sorting
 *
 * Sending `page` opts into the envelope { rows, total, page, pageSize,
 * pageCount, sources }. Without it the response stays a bare array, which is
 * what the calculator's phone autocomplete (ClientInfoBar) expects.
 *
 * Every paginated row carries `totalBooked` (whole-UZS sum of the client's
 * live, non-canceled/non-draft orders). `sortBy=totalBooked` sorts by it.
 */
export const GET = withPermission("client.view", async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const phone = searchParams.get("phone")?.trim();
  const language = searchParams.get("language") ?? undefined;
  const source = searchParams.get("source")?.trim();
  const viloyat = searchParams.get("viloyat")?.trim();

  const filters: Prisma.ClientWhereInput[] = [];

  if (q) {
    const phoneForms = phoneMatchForms(q);
    const addrForms = addressSearchForms(q);
    const orFilters: Prisma.ClientWhereInput[] = [
      { name: { contains: q, mode: "insensitive" } },
    ];
    for (const a of addrForms) {
      orFilters.push({ address: { contains: a, mode: "insensitive" } });
    }
    for (const f of phoneForms) {
      orFilters.push({ phone: { contains: f } });
    }
    filters.push({ OR: orFilters });
  }

  if (phone) {
    // Phone autocomplete: compare against the normalized form so "+998 90"
    // and "8 90" hit the same row.
    const norm = normalizePhone(phone);
    const digits = phone.replace(/\D+/g, "");
    const orFilters: Prisma.ClientWhereInput[] = [];
    if (norm) orFilters.push({ phone: { startsWith: norm } });
    if (digits) orFilters.push({ phone: { contains: digits } });
    if (orFilters.length) filters.push({ OR: orFilters });
  }

  if (language) filters.push({ language: language as "UZ" | "RU" });

  if (source) filters.push({ source });

  if (viloyat) {
    // Addresses are stored in whichever alphabet they were written with, so
    // match both spellings of the canonical region name.
    const v = VILOYATS.find((x) => x.name === viloyat || x.nameUz === viloyat);
    const forms = v ? [v.name, v.nameUz] : [viloyat];
    filters.push({
      OR: forms.map((f) => ({
        address: { contains: f, mode: "insensitive" as const },
      })),
    });
  }

  const where = filters.length ? { AND: filters } : undefined;
  const { page, pageSize, sortBy, sortDir, skip } = parseTableQuery(searchParams, {
    allowedSortFields: CLIENT_SORT_FIELDS,
    defaultSort: "createdAt",
    defaultDir: "desc",
  });
  const orderBy = clientOrderBy(sortBy, sortDir);
  const include = { _count: { select: { deals: true, orders: true } } };

  if (isPaginated(searchParams)) {
    // `totalBooked` (sum of a client's live-order totalPrice) is a groupBy
    // aggregate, not a Client column, so it can't be a Prisma `orderBy` key —
    // the order has to be decided in JS, over the whole filtered set.
    //
    // Which is why the set scanned here is `{ id, name }` (the sort key and its
    // tiebreaker) and nothing else: the phone sends this sort on every Clients
    // open and every keystroke, so a page of rows with their `_count` includes
    // is fetched only once the page's ids are known.
    if (sortBy === "totalBooked") {
      const [keyRows, total, sourceRows] = await prisma.$transaction([
        prisma.client.findMany({ where, select: { id: true, name: true } }),
        prisma.client.count({ where }),
        prisma.client.findMany({
          where: { source: { not: null } },
          select: { source: true },
          distinct: ["source"],
          orderBy: { source: "asc" },
        }),
      ]);
      const groups = keyRows.length
        ? await prisma.order.groupBy({
            by: ["clientId"],
            where: {
              clientId: { in: keyRows.map((r) => r.id) },
              status: { notIn: ["CANCELED", "DRAFT"] },
            },
            _sum: { totalPrice: true },
          })
        : [];
      const pageIds = sortByTotal(attachTotals(keyRows, groups), sortDir)
        .slice(skip, skip + pageSize)
        .map((r) => r.id);
      // `in` answers in the database's order, so the page is put back into the
      // order the sort chose; the totals ride along from the same groupBy.
      const pageRows = pageIds.length
        ? await prisma.client.findMany({ where: { id: { in: pageIds } }, include })
        : [];
      const rows = attachTotals(orderByIds(pageRows, pageIds), groups);
      const sources = sourceRows
        .map((r) => r.source)
        .filter((s): s is string => Boolean(s?.trim()));
      return ok({ rows, ...buildPageMeta(total, page, pageSize), sources });
    }

    // One transaction so `total` can never disagree with `rows`. The source
    // list is deliberately unfiltered — it feeds the Манба filter dropdown,
    // which must keep offering every value even once one is selected.
    const [rows, total, sourceRows] = await prisma.$transaction([
      prisma.client.findMany({ where, orderBy, include, skip, take: pageSize }),
      prisma.client.count({ where }),
      prisma.client.findMany({
        where: { source: { not: null } },
        select: { source: true },
        distinct: ["source"],
        orderBy: { source: "asc" },
      }),
    ]);
    const sources = sourceRows
      .map((r) => r.source)
      .filter((s): s is string => Boolean(s?.trim()));
    // totalBooked rides along on every paginated row regardless of sort, so
    // the mobile client list can show it without a second round trip.
    const ids = rows.map((r) => r.id);
    const groups = ids.length
      ? await prisma.order.groupBy({
          by: ["clientId"],
          where: { clientId: { in: ids }, status: { notIn: ["CANCELED", "DRAFT"] } },
          _sum: { totalPrice: true },
        })
      : [];
    return ok({
      rows: attachTotals(rows, groups),
      ...buildPageMeta(total, page, pageSize),
      sources,
    });
  }

  const clients = await prisma.client.findMany({ where, orderBy, include });

  return ok(clients);
});

export const POST = withPermission("client.create", async (req: NextRequest) => {
  const body = ClientCreateSchema.parse(await req.json());
  const phoneNorm = normalizePhone(body.phone);
  if (!phoneNorm) return fail("phone is required", 422);

  // Dedup by normalized phone — just return the existing one if present
  const existing = await prisma.client.findUnique({ where: { phone: phoneNorm } });
  if (existing) return ok(existing);

  const client = await prisma.client.create({
    data: { ...body, phone: phoneNorm },
  });
  return created(client);
});
