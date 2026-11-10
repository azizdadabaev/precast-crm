/**
 * Gazoblok dashboard reads (Stage 2 spec §4). Read-only: the seven queries run
 * in one Promise.all, Decimals become Number, and the pure math in
 * gazoblok-dashboard.ts does the rest.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, type PermissionSubject } from "@/lib/permissions";
import { round2 } from "@/services/calculation-engine";
import {
  monthlySeries,
  receivablesOf,
  overloadByOperator,
  stockRows,
  truckRows,
  dayPlan,
  type GazoblokDashboard,
  type OpenOrderRow,
} from "@/lib/gazoblok-dashboard";

const OPEN_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  scheduledAt: true,
  shortClosedAt: true,
  client: { select: { name: true } },
  lines: {
    select: {
      id: true,
      productId: true,
      productLabel: true,
      quantity: true,
      product: { select: { lengthM: true, heightM: true, thicknessM: true } },
    },
  },
  shipments: {
    select: { id: true, number: true, status: true, loadedLines: true, loadedAt: true, deliveredAt: true },
  },
} satisfies Prisma.GazoblokOrderSelect;

type OpenOrderDb = Prisma.GazoblokOrderGetPayload<{ select: typeof OPEN_ORDER_SELECT }>;

function toOpenRow(o: OpenOrderDb): OpenOrderRow {
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    clientName: o.client.name,
    scheduledAt: o.scheduledAt,
    shortClosedAt: o.shortClosedAt,
    lines: o.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      productLabel: l.productLabel,
      quantity: l.quantity,
      product: l.product
        ? { lengthM: Number(l.product.lengthM), heightM: Number(l.product.heightM), thicknessM: Number(l.product.thicknessM) }
        : null,
    })),
    shipments: o.shipments,
  };
}

export async function fetchGazoblokDashboard(now: Date): Promise<GazoblokDashboard> {
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [booked, collected, owed, unconfirmed, products, open, finishedToday] = await Promise.all([
    prisma.gazoblokOrder.findMany({
      where: { status: { not: "CANCELED" }, placedAt: { gte: windowStart } },
      select: { placedAt: true, totalPrice: true, totalBlocks: true, totalVolumeM3: true },
    }),
    prisma.gazoblokPayment.findMany({
      where: { status: "CONFIRMED", confirmedAt: { gte: windowStart } },
      select: { amount: true, confirmedAt: true },
    }),
    prisma.gazoblokOrder.findMany({
      where: { status: { not: "CANCELED" }, NOT: { status: "DELIVERED", paymentState: "FULLY_PAID" } },
      select: {
        id: true,
        orderNumber: true,
        totalPrice: true,
        confirmedPaid: true,
        overshipAmount: true,
        createdById: true,
        createdBy: { select: { name: true } },
        client: { select: { name: true } },
        lines: { select: { id: true, productId: true, productLabel: true, quantity: true } },
        shipments: { select: { loadedLines: true } },
      },
    }),
    prisma.gazoblokPayment.aggregate({
      where: { status: "PENDING_CONFIRMATION", order: { status: { not: "CANCELED" } } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.gazoblokProduct.findMany({
      where: { active: true },
      orderBy: { seq: "asc" },
      select: { id: true, label: true, lowStockThreshold: true, stock: { select: { quantity: true } } },
    }),
    prisma.gazoblokOrder.findMany({
      where: { status: { in: ["PLACED", "IN_PRODUCTION"] } },
      select: OPEN_ORDER_SELECT,
    }),
    // Finished orders with a truck delivered today; open orders' trucks come from `open`.
    prisma.gazoblokOrder.findMany({
      where: { status: "DELIVERED", shipments: { some: { deliveredAt: { gte: startOfToday } } } },
      select: OPEN_ORDER_SELECT,
    }),
  ]);

  const openRows = open.map(toOpenRow);
  const { plan, unscheduledOpen } = dayPlan(now, openRows);
  const owedRows = owed.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    totalPrice: Number(o.totalPrice),
    confirmedPaid: Number(o.confirmedPaid),
    overshipAmount: Number(o.overshipAmount),
    createdById: o.createdById,
    createdByName: o.createdBy?.name ?? null,
    clientName: o.client.name,
    lines: o.lines,
    shipments: o.shipments,
  }));

  return {
    generatedAt: now.toISOString(),
    money: {
      months: monthlySeries(
        now,
        booked.map((o) => ({
          placedAt: o.placedAt,
          totalPrice: Number(o.totalPrice),
          totalBlocks: Number(o.totalBlocks),
          totalVolumeM3: Number(o.totalVolumeM3),
        })),
        collected.map((p) => ({ amount: Number(p.amount), confirmedAt: p.confirmedAt })),
      ),
      receivables: receivablesOf(owedRows),
      unconfirmed: { total: round2(Number(unconfirmed._sum.amount ?? 0)), count: unconfirmed._count._all },
      overload: overloadByOperator(owedRows),
    },
    stock: stockRows(
      products.map((p) => ({
        id: p.id,
        label: p.label,
        lowStockThreshold: p.lowStockThreshold,
        onHand: p.stock?.quantity ?? 0,
      })),
      openRows,
    ),
    trucks: truckRows(now, openRows, finishedToday.map(toOpenRow)),
    plan,
    unscheduledOpen,
  };
}

/** Money needs dashboard.view; viewBasic (and inactive users) get stock, trucks and plan only. */
export function forViewer(d: GazoblokDashboard, user: PermissionSubject): GazoblokDashboard {
  return can(user, "dashboard.view") ? d : { ...d, money: null };
}
