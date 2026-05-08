export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { ok, handler } from "@/lib/api";

/**
 * Dashboard KPIs.
 *
 * Cash-custody changes:
 *   - Revenue counts CONFIRMED Payments only (per spec; PENDING and
 *     REJECTED don't count). Method-agnostic — cash + transfer alike.
 *   - "Cash on the road" sums expectedCollection of dispatches whose
 *     returnedAt is null.
 *   - "Open discrepancies" counts Discrepancy rows with status = OPEN.
 */
export const GET = handler(async () => {
  const [
    totalLeads,
    totalDeals,
    wonDeals,
    revenueAgg,
    avgDealAgg,
    dealsByStage,
    leadsBySource,
    recentDeals,
    cashOnRoadAgg,
    openDiscrepancies,
  ] = await Promise.all([
    prisma.client.count(),
    prisma.deal.count(),
    prisma.deal.count({ where: { status: "WON" } }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: "CONFIRMED" },
    }),
    prisma.deal.aggregate({
      _avg: { value: true },
      where: { status: "WON" },
    }),
    prisma.deal.groupBy({
      by: ["stage"],
      _count: { _all: true },
      _sum: { value: true },
    }),
    prisma.client.groupBy({
      by: ["source"],
      _count: { _all: true },
    }),
    prisma.deal.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { client: { select: { name: true, phone: true } } },
    }),
    prisma.dispatch.aggregate({
      _sum: { expectedCollection: true },
      where: { returnedAt: null },
    }),
    prisma.discrepancy.count({ where: { status: "OPEN" } }),
  ]);

  const totalRevenue = Number(revenueAgg._sum.amount ?? 0);
  const avgDealValue = Number(avgDealAgg._avg.value ?? 0);
  const conversionRate = totalDeals > 0 ? (wonDeals / totalDeals) * 100 : 0;
  const cashOnRoad = Number(cashOnRoadAgg._sum.expectedCollection ?? 0);

  return ok({
    totals: {
      totalLeads,
      totalDeals,
      wonDeals,
      totalRevenue,
      avgDealValue: Math.round(avgDealValue),
      conversionRate: Math.round(conversionRate * 10) / 10,
      cashOnRoad,
      openDiscrepancies,
    },
    dealsByStage: dealsByStage.map((d) => ({
      stage: d.stage,
      count: d._count._all,
      value: Number(d._sum.value ?? 0),
    })),
    leadsBySource: leadsBySource.map((l) => ({
      source: l.source ?? "Unknown",
      count: l._count._all,
    })),
    recentDeals,
  });
});
