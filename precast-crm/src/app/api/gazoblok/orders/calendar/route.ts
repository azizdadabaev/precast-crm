export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { calendarDays, monthBounds, monthKey, parseMonthParam } from "@/lib/gazoblok-calendar";

/** GET /api/gazoblok/orders/calendar?month=YYYY-MM — `order.view`, read-only. Per scheduled
 *  day of the month: {date, orders, blocks, flags}, cancelled excluded; plus the count of
 *  open orders with no date (planning). Month bounds are server-local, like the list. */
export const GET = withPermission("order.view", async (req: NextRequest) => {
  const raw = new URL(req.url).searchParams.get("month");
  const now = new Date();
  const parsed = raw === null ? { year: now.getFullYear(), month: now.getMonth() + 1 } : parseMonthParam(raw);
  if (!parsed) return fail("Ой нотўғри (YYYY-MM) · Invalid month (YYYY-MM)", 400);

  const { start, end } = monthBounds(parsed.year, parsed.month);
  const [rows, unscheduledOpen] = await Promise.all([
    prisma.gazoblokOrder.findMany({
      where: { scheduledAt: { gte: start, lt: end }, status: { not: "CANCELED" } },
      select: {
        status: true,
        scheduledAt: true,
        totalBlocks: true,
        totalPrice: true,
        confirmedPaid: true,
        overshipAmount: true,
      },
    }),
    prisma.gazoblokOrder.count({ where: { scheduledAt: null, status: { in: ["PLACED", "IN_PRODUCTION"] } } }),
  ]);

  return ok({
    month: monthKey(parsed.year, parsed.month),
    days: calendarDays(
      rows.map((r) => ({
        status: r.status,
        scheduledAt: r.scheduledAt,
        totalBlocks: r.totalBlocks,
        totalPrice: Number(r.totalPrice),
        confirmedPaid: Number(r.confirmedPaid),
        overshipAmount: Number(r.overshipAmount),
      })),
    ),
    unscheduledOpen,
  });
});
