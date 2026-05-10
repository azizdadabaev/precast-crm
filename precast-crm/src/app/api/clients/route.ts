export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ClientCreateSchema } from "@/lib/validation";
import { ok, created, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { normalizePhone, phoneMatchForms } from "@/lib/phone";

/**
 * GET /api/clients
 *   ?q=...      free-text search across name, address, and trailing phone digits
 *   ?phone=...  exact-or-prefix match on the normalized phone — used by the
 *               calculator's autocomplete to dedup
 *   ?language=  filter UZ/RU
 */
export const GET = withPermission("client.view", async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const phone = searchParams.get("phone")?.trim();
  const language = searchParams.get("language") ?? undefined;

  const filters: Prisma.ClientWhereInput[] = [];

  if (q) {
    const phoneForms = phoneMatchForms(q);
    const orFilters: Prisma.ClientWhereInput[] = [
      { name: { contains: q, mode: "insensitive" } },
      { address: { contains: q, mode: "insensitive" } },
    ];
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

  const clients = await prisma.client.findMany({
    where: filters.length ? { AND: filters } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { deals: true, orders: true } },
    },
    take: 200,
  });

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
