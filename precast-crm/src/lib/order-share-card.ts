// An ORDER's share card, built on the server from the order id.
//
// The Android app was drawing this one itself in Compose — a second, hand-mirrored
// copy of `CalculationShareCard` — and it drifted, exactly as the calculator's did.
// The customer got a plain summary where the web sends the full table: the load
// list, the per-room columns, the weight in the totals row.
//
// Rebuilt here rather than shipped from the phone, because for an ORDER the server
// already holds every figure. The phone sends an id and gets the picture; there is
// nothing on the wire that could disagree with what the CRM believes.
//
// Mirrors `src/app/(app)/orders/[id]/page.tsx`'s own `shareData` construction field
// for field. When that page changes, this changes with it — the two are one
// document and a customer must not be able to tell which produced theirs.

import { prisma } from "@/lib/prisma";
import { displayedDiscount } from "@/lib/order-display";
import type { ShareData } from "@/components/share/CalculationShareCard";

/** The page's own wording for the payment pill. */
const PAYMENT_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: "Тўлов кутилмоқда",
  PARTIALLY_PAID: "Қисман тўланган",
  FULLY_PAID: "Тўлиқ тўланган",
};

/** The page's badge classes, kept here so the card looks the same from either source. */
const PAYMENT_BADGE: Record<string, string> = {
  AWAITING_PAYMENT: "bg-amber-100 text-amber-700",
  PARTIALLY_PAID: "bg-blue-100 text-blue-700",
  FULLY_PAID: "bg-emerald-100 text-emerald-700",
};

const WEEKDAY_UZ = [
  "Якшанба", "Душанба", "Сешанба", "Чоршанба", "Пайшанба", "Жума", "Шанба",
];

function uzDate(d: Date): string {
  const months = [
    "январ", "феврал", "март", "апрел", "май", "июн",
    "июл", "август", "сентябр", "октябр", "ноябр", "декабр",
  ];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

const num = (v: unknown): number => Number(v);

/** Null when the order does not exist — the render page then 404s. */
export async function buildShareDataFromOrder(orderId: string): Promise<ShareData | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true,
      scheduledAt: true,
      paymentState: true,
      totalPrice: true,
      confirmedPaid: true,
      writeOffAmount: true,
      roomsSubtotal: true,
      discountPercent: true,
      discountAmount: true,
      deliveryCost: true,
      otherCost: true,
      client: { select: { name: true, phone: true, address: true } },
      project: {
        select: {
          calculations: {
            orderBy: { seq: "asc" },
            select: {
              name: true, innerWidth: true, innerLength: true, bearing: true,
              pattern: true, patternAuto: true, beamLength: true, blocksPerRow: true,
              blockRows: true, totalBlocks: true, beamCount: true, monolithLength: true,
              monolithArea: true, m2Price: true, subtotal: true,
            },
          },
        },
      },
    },
  });
  if (!order) return null;

  const calcs = order.project?.calculations ?? [];
  const totals = calcs.reduce(
    (a, c) => ({
      blocks: a.blocks + c.totalBlocks,
      beams: a.beams + c.beamCount,
      monolithLength: a.monolithLength + num(c.monolithLength),
      monolithArea: a.monolithArea + num(c.monolithArea),
      sum: a.sum + num(c.subtotal),
    }),
    { blocks: 0, beams: 0, monolithLength: 0, monolithArea: 0, sum: 0 },
  );

  const totalNum = num(order.totalPrice) || num(order.roomsSubtotal);
  const paidNum = num(order.confirmedPaid);
  const writeOffNum = num(order.writeOffAmount ?? 0);
  const remainingNum = Math.max(0, totalNum - paidNum - writeOffNum);
  const deliveryNum = num(order.deliveryCost);
  const otherNum = num(order.otherCost);
  // Derived from its printed neighbours, the way the page prints it, so the column
  // adds up on the card exactly as it does on screen.
  const shownDiscount = displayedDiscount({
    roomsSubtotal: order.roomsSubtotal.toString(),
    discountAmount: order.discountAmount.toString(),
    deliveryCost: order.deliveryCost.toString(),
    otherCost: order.otherCost.toString(),
    totalPrice: order.totalPrice.toString(),
  });

  const scheduled = new Date(order.scheduledAt);

  return {
    title: `Буюртма №${order.orderNumber}`,
    clientName: order.client.name,
    clientPhone: order.client.phone,
    clientAddress: order.client.address,
    payment: {
      totalPrice: totalNum,
      paid: paidNum,
      remaining: remainingNum,
      badgeLabel: PAYMENT_LABEL[order.paymentState] ?? "",
      badgeColorCls: PAYMENT_BADGE[order.paymentState] ?? "",
    },
    pricing: {
      subtotal: num(order.roomsSubtotal),
      discountAmount: shownDiscount,
      discountPercent: num(order.discountPercent),
      deliveryCost: deliveryNum,
      otherCost: otherNum,
      total: totalNum,
    },
    scheduledLabel: `${WEEKDAY_UZ[scheduled.getDay()]}, ${uzDate(scheduled)}`,
    rows: calcs.map((c) => ({
      name: c.name ?? "",
      innerWidth: num(c.innerWidth),
      innerLength: num(c.innerLength),
      bearing: num(c.bearing),
      pattern: c.pattern as "GB" | "BGB" | "GBG",
      patternAuto: (c.patternAuto ?? null) as "GB" | "BGB" | "GBG" | null,
      beamLength: num(c.beamLength),
      blocksPerRow: c.blockRows > 0 ? c.blocksPerRow : null,
      totalBlocks: c.totalBlocks,
      beamCount: c.beamCount,
      monolithLength: num(c.monolithLength),
      monolithArea: num(c.monolithArea),
      m2Price: num(c.m2Price),
      subtotal: num(c.subtotal),
    })),
    totals,
  };
}
