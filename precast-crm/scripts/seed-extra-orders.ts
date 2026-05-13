// One-off seed: adds 20 extra orders against existing clients so the
// /orders pagination + day-filter UI has enough material to exercise.
//
// Re-runnable: each run allocates fresh order numbers from the current
// month's highest, so calling it twice just adds another 20.
//
// Usage: npx tsx scripts/seed-extra-orders.ts

import { PrismaClient, OrderStatus, OrderPaymentState } from "@prisma/client";
import { calculateSlab } from "../src/services/calculation-engine";
import { calcResultToCreatePayload } from "../src/lib/calc-persistence";
import { nextOrderNumber } from "../src/lib/order-number";

const prisma = new PrismaClient();

const ROOM_PRESETS = [
  { name: "Living room", w: 4.0, l: 6.2 },
  { name: "Kitchen",     w: 3.6, l: 4.8 },
  { name: "Master bed",  w: 4.2, l: 5.4 },
  { name: "Garage",      w: 5.0, l: 7.0 },
  { name: "Office",      w: 3.4, l: 4.6 },
  { name: "Hall",        w: 5.6, l: 8.2 },
  { name: "Bedroom",     w: 3.2, l: 4.0 },
  { name: "Workshop",    w: 6.0, l: 9.0 },
];

const STATUS_PLAN: Array<{ status: OrderStatus; paymentState: OrderPaymentState; paidRatio: number }> = [
  { status: "PLACED",         paymentState: "AWAITING_PAYMENT", paidRatio: 0 },
  { status: "PLACED",         paymentState: "AWAITING_PAYMENT", paidRatio: 0 },
  { status: "PLACED",         paymentState: "PARTIALLY_PAID",   paidRatio: 0.2 },
  { status: "PLACED",         paymentState: "PARTIALLY_PAID",   paidRatio: 0.3 },
  { status: "IN_PRODUCTION",  paymentState: "PARTIALLY_PAID",   paidRatio: 0.3 },
  { status: "IN_PRODUCTION",  paymentState: "PARTIALLY_PAID",   paidRatio: 0.5 },
  { status: "IN_PRODUCTION",  paymentState: "AWAITING_PAYMENT", paidRatio: 0 },
  { status: "IN_PRODUCTION",  paymentState: "PARTIALLY_PAID",   paidRatio: 0.4 },
  { status: "DISPATCHED",     paymentState: "PARTIALLY_PAID",   paidRatio: 0.5 },
  { status: "DISPATCHED",     paymentState: "PARTIALLY_PAID",   paidRatio: 0.7 },
  { status: "DISPATCHED",     paymentState: "FULLY_PAID",       paidRatio: 1 },
  { status: "DISPATCHED",     paymentState: "PARTIALLY_PAID",   paidRatio: 0.6 },
  { status: "DELIVERED",      paymentState: "FULLY_PAID",       paidRatio: 1 },
  { status: "DELIVERED",      paymentState: "FULLY_PAID",       paidRatio: 1 },
  { status: "DELIVERED",      paymentState: "FULLY_PAID",       paidRatio: 1 },
  { status: "DELIVERED",      paymentState: "PARTIALLY_PAID",   paidRatio: 0.85 },
  { status: "DELIVERED",      paymentState: "FULLY_PAID",       paidRatio: 1 },
  { status: "DELIVERED",      paymentState: "PARTIALLY_PAID",   paidRatio: 0.9 },
  { status: "CANCELED",       paymentState: "AWAITING_PAYMENT", paidRatio: 0 },
  { status: "CANCELED",       paymentState: "AWAITING_PAYMENT", paidRatio: 0 },
];

// Spread scheduledAt across -10..+20 days from today so the calendar
// day-filter has rows on many different days to test.
const DAY_OFFSETS = [-10, -8, -7, -5, -3, -2, -1, 0, 1, 1, 2, 3, 5, 6, 8, 10, 12, 14, 17, 20];

async function main() {
  console.log("🌱 Adding 20 extra orders for pagination testing…");

  const clients = await prisma.client.findMany({ take: 7, orderBy: { createdAt: "asc" } });
  if (clients.length === 0) {
    console.error("No clients found — run `npm run db:seed` first.");
    process.exit(1);
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;

  const highest = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: monthPrefix } },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  let highestNumber: string | null = highest?.orderNumber ?? null;

  for (let i = 0; i < STATUS_PLAN.length; i++) {
    const plan = STATUS_PLAN[i];
    const client = clients[i % clients.length];
    const roomCount = (i % 3) + 1;
    const rooms = Array.from({ length: roomCount }, (_, k) => {
      const preset = ROOM_PRESETS[(i + k) % ROOM_PRESETS.length];
      return {
        input: { name: preset.name, innerWidth: preset.w, innerLength: preset.l },
        result: calculateSlab({ inner_width: preset.w, inner_length: preset.l }),
      };
    });

    const roomsSubtotal = rooms.reduce((s, r) => s + r.result.subtotal, 0);
    const totalArea = rooms.reduce((s, r) => s + r.result.monolith_area, 0);
    const totalBlocks = rooms.reduce((s, r) => s + r.result.total_blocks, 0);
    const totalBeams = rooms.reduce((s, r) => s + r.result.beam_count, 0);
    const deliveryCost = 400_000 + (i % 5) * 100_000;
    const totalPrice = roomsSubtotal + deliveryCost;
    const confirmedPaid = Math.round(totalPrice * plan.paidRatio);

    const scheduledAt = new Date(now);
    scheduledAt.setDate(scheduledAt.getDate() + DAY_OFFSETS[i]);
    scheduledAt.setHours(9, 0, 0, 0);

    const project = await prisma.project.create({
      data: {
        clientId: client.id,
        name: `Pagination demo · #${i + 1}`,
        shapeType: "RECTANGULAR",
        dimensions: { width: rooms[0].input.innerWidth, length: rooms[0].input.innerLength },
        status: "ORDERED",
        calculations: { create: rooms.map((r) => calcResultToCreatePayload(r.input, r.result)) },
      },
      include: { calculations: true },
    });

    const orderNumber = nextOrderNumber(year, month, highestNumber);
    highestNumber = orderNumber;

    const order = await prisma.order.create({
      data: {
        orderNumber,
        projectId: project.id,
        clientId: client.id,
        primaryCalculationId: project.calculations[0]?.id ?? null,
        status: plan.status,
        paymentState: plan.paymentState,
        roomsSubtotal,
        discountPercent: 0,
        discountAmount: 0,
        deliveryCost,
        otherCost: 0,
        totalPrice,
        totalArea,
        totalBlocks,
        totalBeams,
        confirmedPaid,
        scheduledAt,
        placedAt: now,
        productionStartedAt: plan.status !== "PLACED" && plan.status !== "CANCELED" ? now : null,
        deliveredAt: plan.status === "DELIVERED" ? now : null,
        paidAt: plan.paymentState === "FULLY_PAID" ? now : null,
        canceledAt: plan.status === "CANCELED" ? now : null,
      },
    });

    await prisma.orderEvent.create({
      data: { orderId: order.id, type: "ORDER_PLACED", message: `Seed (extra) · ${plan.status}` },
    });

    console.log(`  + ${orderNumber}  ${plan.status.padEnd(14)}  ${client.name}  ${scheduledAt.toISOString().slice(0, 10)}`);
  }

  console.log(`✅ Added ${STATUS_PLAN.length} orders.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
