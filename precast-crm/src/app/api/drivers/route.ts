export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { DriverCreateSchema } from "@/lib/validation";
import { ok, created, fail, handler } from "@/lib/api";
import { normalizePhone } from "@/lib/phone";

/**
 * GET /api/drivers
 *   ?activeOnly=true    skip deactivated drivers (default: include all)
 *
 * Includes counts useful for the drivers admin page:
 *   - active dispatches (no returnedAt yet)
 *   - discrepancies in last 30 days
 */
export const GET = handler(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const activeOnly = searchParams.get("activeOnly") === "true";
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const drivers = await prisma.driver.findMany({
    where: activeOnly ? { active: true } : undefined,
    orderBy: [{ active: "desc" }, { name: "asc" }],
    include: {
      _count: { select: { dispatches: true } },
      dispatches: {
        orderBy: { dispatchedAt: "desc" },
        take: 1,
        select: { dispatchedAt: true, returnedAt: true },
      },
    },
  });

  // Augment with derived counts (Prisma can't filter `_count` by date in 5.x).
  const ids = drivers.map((d) => d.id);
  const [activeDispatchByDriver, discrepancyByDriver] = await Promise.all([
    prisma.dispatch.groupBy({
      by: ["driverId"],
      where: { driverId: { in: ids }, returnedAt: null },
      _count: { _all: true },
    }),
    prisma.discrepancy.groupBy({
      by: ["driverId"],
      where: { driverId: { in: ids }, reportedAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);
  const activeMap = new Map(activeDispatchByDriver.map((g) => [g.driverId, g._count._all]));
  const discMap = new Map(discrepancyByDriver.map((g) => [g.driverId, g._count._all]));

  return ok(
    drivers.map((d) => ({
      ...d,
      activeDispatchCount: activeMap.get(d.id) ?? 0,
      discrepancyCount30d: discMap.get(d.id) ?? 0,
      lastDispatchAt: d.dispatches[0]?.dispatchedAt ?? null,
    })),
  );
});

/**
 * POST /api/drivers   (any role)
 * Phone is normalized to digits-only so dedup is stable.
 */
export const POST = handler(async (req: NextRequest) => {
  const body = DriverCreateSchema.parse(await req.json());
  const phoneNorm = normalizePhone(body.phone);
  if (!phoneNorm) return fail("phone is required", 422);

  // Dedup: if a driver with this phone already exists, return them.
  const existing = await prisma.driver.findUnique({ where: { phone: phoneNorm } });
  if (existing) return ok(existing);

  const driver = await prisma.driver.create({
    data: {
      name: body.name,
      phone: phoneNorm,
      notes: body.notes ?? null,
    },
  });
  return created(driver);
});
